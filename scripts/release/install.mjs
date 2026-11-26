import { mkdtemp, rm, writeFile } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { DEFAULT_REGISTRY, INSTALL_SMOKE_IMPORTS, PACKAGES } from "./constants.mjs";
import { formatJson } from "./io.mjs";
import { readReleaseManifest } from "./artifact-manifest.mjs";
import { createLogger, defaultExec } from "./runner.mjs";

function installSmokeScript(manifest) {
  const expected = manifest.packages.map((entry) => ({
    name: entry.name,
    dir: PACKAGES.find((spec) => spec.name === entry.name).dir,
    version: entry.version,
    imports: INSTALL_SMOKE_IMPORTS[entry.name] ?? [entry.name],
  }));
  return `
import { readFileSync, existsSync, statSync } from "node:fs";
const expected = ${JSON.stringify(expected)};
for (const item of expected) {
  const pkgUrl = new URL("./node_modules/" + item.name + "/package.json", import.meta.url);
  const pkg = JSON.parse(readFileSync(pkgUrl, "utf8"));
  if (pkg.name !== item.name || pkg.version !== item.version) {
    throw new Error(item.name + " installed as " + pkg.name + "@" + pkg.version);
  }
  for (const [bin, target] of Object.entries(pkg.bin ?? {})) {
    const binUrl = new URL("./node_modules/" + item.name + "/" + String(target).replace(/^\\.\\//, ""), import.meta.url);
    if (!existsSync(binUrl) || !statSync(binUrl).isFile()) {
      throw new Error(item.name + " bin " + bin + " is missing " + target);
    }
    const linkUrl = new URL("./node_modules/.bin/" + bin, import.meta.url);
    if (!existsSync(linkUrl)) throw new Error(item.name + " has no .bin/" + bin);
  }
  for (const specifier of item.imports) {
    const subpath = specifier === item.name ? "." : "./" + specifier.slice(item.name.length + 1);
    if (!pkg.exports || typeof pkg.exports !== "object" || !(subpath in pkg.exports)) {
      throw new Error(item.name + " does not declare export " + subpath + " for " + specifier);
    }
    await import(specifier);
  }
}
console.log("install smoke passed");
`;
}

export async function verifyInstall({
  root,
  outDir,
  manifest,
  registry = DEFAULT_REGISTRY,
  exec = defaultExec,
  logger,
} = {}) {
  const log = createLogger(logger);
  const release = manifest ?? (await readReleaseManifest({ root, outDir }));
  const destination = path.resolve(root, outDir ?? release.outDir);
  const temporary = await mkdtemp(path.join(os.tmpdir(), "nones-release-install-"));
  try {
    await writeFile(
      path.join(temporary, "package.json"),
      formatJson({ name: "nones-release-smoke", private: true, type: "module" }),
    );
    const tarballs = release.packages.map((entry) => path.join(destination, entry.tarball));
    await exec(
      "npm",
      [
        "install",
        "--ignore-scripts",
        "--no-audit",
        "--no-fund",
        "--package-lock=false",
        "--registry",
        registry,
        ...tarballs,
      ],
      { cwd: temporary },
    );
    await exec(process.execPath, ["--input-type=module", "--eval", installSmokeScript(release)], {
      cwd: temporary,
    });
    log.info(`install smoke passed for ${release.packages.length} exact tarballs`);
    return { ok: true, temporary };
  } finally {
    await rm(temporary, { recursive: true, force: true });
  }
}
