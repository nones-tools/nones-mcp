import { expect, test } from "bun:test";
import { readdirSync, readFileSync } from "node:fs";
import path from "node:path";

const projectRoot = path.resolve(import.meta.dir, "..");

function typescriptFiles(directory: string): string[] {
  const files: string[] = [];
  for (const entry of readdirSync(directory, { withFileTypes: true })) {
    const target = path.join(directory, entry.name);
    if (entry.isDirectory()) files.push(...typescriptFiles(target));
    else if (entry.name.endsWith(".ts")) files.push(target);
  }
  return files;
}

test("source and tests use extensionless relative imports", () => {
  const offenders: string[] = [];
  const files = [
    ...typescriptFiles(path.join(projectRoot, "src")),
    ...typescriptFiles(path.join(projectRoot, "tests")),
  ];
  for (const file of files) {
    const source = readFileSync(file, "utf8");
    const specifiers = source.matchAll(
      /(?:from\s+|import\s*\(\s*|import\s+)["'](\.[^"']+)["']/g,
    );
    for (const match of specifiers) {
      if (/\.(?:[cm]?[jt]s|json)$/.test(match[1])) {
        offenders.push(`${path.relative(projectRoot, file)}: ${match[1]}`);
      }
    }
  }
  expect(offenders).toEqual([]);
});
