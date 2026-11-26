#!/usr/bin/env node
/**
 * TypeScript emits declarations with the same extensionless specifiers used by
 * the source. NodeNext consumers require explicit extensions in declaration
 * imports, so add `.js` only to relative specifiers after declaration emit.
 */
import { readdir, readFile, writeFile } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";

const projectRoot = path.resolve(
  path.dirname(fileURLToPath(import.meta.url)),
  "..",
);
const dist = path.resolve(projectRoot, process.argv[2] ?? "dist");
const relativeSpecifier = /^(?:\.\.?)\//;
const hasExtension = /\.(?:[cm]?[jt]s|json)$/;

function withExtension(specifier) {
  if (!relativeSpecifier.test(specifier) || hasExtension.test(specifier)) {
    return specifier;
  }
  return `${specifier}.js`;
}

function rewrite(source) {
  return source
    .replace(
      /(\bfrom\s*|\bimport\s*\(\s*)(["'])(\.[^"']+)\2/g,
      (_, prefix, quote, specifier) =>
        `${prefix}${quote}${withExtension(specifier)}${quote}`,
    )
    .replace(
      /(\bimport\s+)(["'])(\.[^"']+)\2/g,
      (_, prefix, quote, specifier) =>
        `${prefix}${quote}${withExtension(specifier)}${quote}`,
    );
}

async function declarations(directory) {
  const entries = await readdir(directory, { withFileTypes: true });
  const files = [];
  for (const entry of entries) {
    const target = path.join(directory, entry.name);
    if (entry.isDirectory()) files.push(...(await declarations(target)));
    else if (entry.name.endsWith(".d.ts")) files.push(target);
  }
  return files;
}

const files = await declarations(dist);
let changed = 0;
for (const file of files) {
  const source = await readFile(file, "utf8");
  const output = rewrite(source);
  if (output !== source) {
    await writeFile(file, output);
    changed++;
  }
}
console.log(
  `Declaration imports: ${files.length} files checked, ${changed} rewritten`,
);
