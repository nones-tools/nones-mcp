// Deterministic packaging checks: no publish, no network.
import { readFile, readdir, stat } from "node:fs/promises";
import { execFile } from "node:child_process";
import path from "node:path";
import { promisify } from "node:util";

const run = promisify(execFile);
const root = path.resolve(import.meta.dir, "..");
const PACKAGES = ["apps/core", "adapters/journal", "apps/kaiten", "apps/opencode", "apps/dsh"];
const failures: string[] = [];

function check(condition: boolean, message: string): void {
  if (!condition) failures.push(message);
}

async function walk(directory: string): Promise<string[]> {
  const files: string[] = [];
  for (const entry of await readdir(directory, { withFileTypes: true })) {
    const full = path.join(directory, entry.name);
    if (entry.isDirectory()) files.push(...(await walk(full)));
    else files.push(full);
  }
  return files;
}

const rootPkg = JSON.parse(await readFile(path.join(root, "package.json"), "utf8")) as {
  private?: boolean;
  packageManager?: string;
  workspaces?: string[];
};
check(rootPkg.private === true, "root package must stay private");
check(rootPkg.packageManager === "bun@1.4.5", "root must pin bun@1.4.5");
check(
  JSON.stringify(rootPkg.workspaces) === JSON.stringify(["apps/*", "adapters/*"]),
  "workspaces must be apps/* and adapters/*",
);
await stat(path.join(root, "bun.lock")).catch(() =>
  failures.push("bun.lock is missing; the lockfile must be committed"),
);

for (const relative of PACKAGES) {
  const directory = path.join(root, relative);
  const pkg = JSON.parse(await readFile(path.join(directory, "package.json"), "utf8")) as {
    name: string;
    version: string;
    files?: string[];
    engines?: { node?: string };
    exports?: Record<string, { types?: string; import?: string; default?: string }>;
    dependencies?: Record<string, string>;
  };
  const label = pkg.name;
  check(pkg.version !== "0.0.0", `${label} must have its own version`);
  const expectedEngine = label === "@nones/kaiten-mcp" ? ">=18" : ">=22.14";
  check(pkg.engines?.node === expectedEngine, `${label} must keep node ${expectedEngine}`);
  check(pkg.files?.[0] === "dist", `${label} must publish dist first`);
  check(
    (pkg.files ?? []).every((file) => file === "dist" || !file.startsWith("src")),
    `${label} must not publish source directories`,
  );
  const exportMap = pkg.exports as Record<string, { types?: string; import?: string }>;
  if (label === "@nones/journal") {
    check(exportMap["./sqlite"]?.types === "./dist/sqlite/index.d.ts", "journal needs a ./sqlite types entry");
    check(exportMap["./sqlite"]?.import === "./dist/sqlite/index.js", "journal needs a ./sqlite import entry");
  } else {
    const entry = exportMap["."];
    check(entry?.types === "./dist/index.d.ts", `${label} needs a packed types entry`);
    check(
      entry?.import === "./dist/index.js" || entry?.default === "./dist/index.js",
      `${label} needs a packed import/default entry`,
    );
  }
  if (label === "@nones/mcp-core") {
    check(exportMap["./journal"]?.types === "./dist/journal/index.d.ts", "core needs a ./journal types entry");
    check(exportMap["./journal"]?.import === "./dist/journal/index.js", "core needs a ./journal import entry");
  }
  const moduleExport = exportMap["./module"];
  const expectsModule = label === "@nones/kaiten-mcp" || label === "@nones/opencode-mcp";
  if (expectsModule) {
    check(moduleExport?.types?.endsWith(".d.ts") === true, `${label} needs a ./module types entry`);
    check(moduleExport?.import?.endsWith(".js") === true, `${label} needs a ./module import entry`);
  }
  if (label === "@nones/dsh-session-mcp") {
    for (const subpath of ["./server", "./config", "./client"] as const) {
      check(exportMap[subpath]?.types?.endsWith(".d.ts") === true, `${label} needs a ${subpath} types entry`);
      check(exportMap[subpath]?.default?.endsWith(".js") === true, `${label} needs a ${subpath} default entry`);
    }
    check(exportMap["./icon"] === "./icon.svg", `${label} must publish its icon`);
    check(pkg.dependencies?.["@nones/mcp-core"] === pkg.version, `${label} must depend on the same core version`);
    check(pkg.dependencies?.["@nones/journal"] === pkg.version, `${label} must depend on the same journal version`);
  }
  const entryFiles = label === "@nones/journal"
    ? ["dist/sqlite/index.js", "dist/sqlite/index.d.ts"]
    : label === "@nones/dsh-session-mcp"
      ? [
          "dist/index.js",
          "dist/index.d.ts",
          "dist/server.js",
          "dist/server.d.ts",
          "dist/config.js",
          "dist/config.d.ts",
          "dist/client.js",
          "dist/client.d.ts",
        ]
      : ["dist/index.js", "dist/index.d.ts"];
  for (const file of entryFiles) {
    await stat(path.join(directory, file)).catch(() =>
      failures.push(`${label} is missing ${file}; run bun run build`),
    );
  }

  const declarations = (await walk(path.join(directory, "dist"))).filter((file) =>
    file.endsWith(".d.ts"),
  );
  for (const declaration of declarations) {
    const source = await readFile(declaration, "utf8");
    for (const match of source.matchAll(/from\s+"(\.[^"]+)"/g)) {
      const specifier = match[1] as string;
      check(
        !specifier.endsWith(".ts") && specifier.includes("."),
        `${label}: ${path.basename(declaration)} has non-packed import ${specifier}`,
      );
      const target = path.resolve(
        path.dirname(declaration),
        specifier.replace(/\.js$/, ".d.ts"),
      );
      await stat(target).catch(() =>
        failures.push(`${label}: ${path.basename(declaration)} references missing ${specifier}`),
      );
    }
  }

  const packed = await run(
    "npm",
    ["pack", "--dry-run", "--json", "--ignore-scripts"],
    { cwd: directory },
  ).catch((error: Error) => error);
  if (packed instanceof Error) {
    failures.push(`${label}: npm pack --dry-run failed: ${packed.message}`);
    continue;
  }
  const report = JSON.parse(packed.stdout) as Array<{ files: Array<{ path: string }> }>;
  const paths = report[0]?.files.map((file) => file.path) ?? [];
  for (const file of entryFiles) {
    check(paths.includes(file), `${label}: packed tarball lacks ${file}`);
  }
  if (label === "@nones/dsh-session-mcp") {
    for (const file of ["cordis.patch.yml", "locale/en.json", "locale/ru.json", "icon.svg"]) {
      check(paths.includes(file), `${label}: packed tarball lacks ${file}`);
    }
    check(
      paths.some((file) => /^locale\/[^/]+\.json$/.test(file)),
      `${label}: packed tarball lacks a real locale/*.json target`,
    );
  }
  check(!paths.some((file) => file.startsWith("src/")), `${label}: packed tarball leaks src/`);
  console.log(`${label}@${pkg.version}: ${paths.length} packed files, declarations ok`);
}

if (failures.length > 0) {
  console.error(failures.map((failure) => `FAIL ${failure}`).join("\n"));
  process.exit(1);
}
console.log("pack:check passed");
