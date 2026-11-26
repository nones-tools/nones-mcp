import { mkdir, readFile, rename, rm, stat, writeFile } from "node:fs/promises";
import path from "node:path";
import { ReleaseError } from "./errors.mjs";

export async function readText(file) {
  return readFile(file, "utf8");
}

export async function readJson(file) {
  let text;
  try {
    text = await readText(file);
  } catch (error) {
    throw new ReleaseError(`Cannot read ${file}: ${error.message}`);
  }
  try {
    return JSON.parse(text);
  } catch (error) {
    throw new ReleaseError(`Cannot parse ${file}: ${error.message}`);
  }
}

export function formatJson(value) {
  return `${JSON.stringify(value, null, 2)}\n`;
}

export async function atomicWrite(file, contents) {
  await mkdir(path.dirname(file), { recursive: true });
  let mode;
  try {
    mode = (await stat(file)).mode;
  } catch {
    mode = 0o644;
  }
  const temporary = `${file}.tmp-${process.pid}`;
  try {
    await writeFile(temporary, contents, { mode });
    await rename(temporary, file);
  } catch (error) {
    await rm(temporary, { force: true });
    throw error;
  }
}

export function displayPath(root, file) {
  const relative = path.relative(root, file);
  return relative && !relative.startsWith("..") ? relative : file;
}

export function findMatchingBrace(text, openIndex) {
  let depth = 0;
  let inString = false;
  let escaped = false;
  for (let index = openIndex; index < text.length; index += 1) {
    const character = text[index];
    if (inString) {
      if (escaped) escaped = false;
      else if (character === "\\") escaped = true;
      else if (character === '"') inString = false;
      continue;
    }
    if (character === '"') {
      inString = true;
      continue;
    }
    if (character === "{") depth += 1;
    else if (character === "}") {
      depth -= 1;
      if (depth === 0) return index;
    }
  }
  throw new ReleaseError("Unbalanced object in bun.lock");
}

export function findObjectBlock(text, key) {
  const quoted = JSON.stringify(key);
  let searchFrom = 0;
  while (searchFrom < text.length) {
    const start = text.indexOf(quoted, searchFrom);
    if (start < 0) break;
    let cursor = start + quoted.length;
    while (/\s/.test(text[cursor] ?? "")) cursor += 1;
    if (text[cursor] !== ":") {
      searchFrom = start + quoted.length;
      continue;
    }
    cursor += 1;
    while (/\s/.test(text[cursor] ?? "")) cursor += 1;
    if (text[cursor] !== "{") {
      searchFrom = start + quoted.length;
      continue;
    }
    const end = findMatchingBrace(text, cursor);
    return { start, open: cursor, end: end + 1, text: text.slice(start, end + 1) };
  }
  throw new ReleaseError(`bun.lock is missing the ${JSON.stringify(key)} object`);
}
