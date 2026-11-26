// Appends .js to extensionless relative specifiers in emitted .d.ts files so
// packed declarations resolve under NodeNext while source keeps extensionless
// imports. Runs after `tsc --emitDeclarationOnly`.
import { readdir, readFile, writeFile } from "node:fs/promises";
import path from "node:path";

const roots = process.argv.slice(2);
const RELATIVE = /(from\s+|import\()(["'])(\.\.?\/[^"']+)\2/g;

async function walk(directory) {
  const entries = await readdir(directory, { withFileTypes: true });
  for (const entry of entries) {
    const full = path.join(directory, entry.name);
    if (entry.isDirectory()) await walk(full);
    else if (entry.name.endsWith(".d.ts")) await fix(full);
  }
}

async function fix(file) {
  const before = await readFile(file, "utf8");
  const after = before.replace(RELATIVE, (match, prefix, quote, specifier) => {
    if (/\.(?:js|json|mjs|cjs|d\.ts)$/.test(specifier)) return match;
    return `${prefix}${quote}${specifier}.js${quote}`;
  });
  if (after !== before) await writeFile(file, after);
}

for (const root of roots) await walk(root);
