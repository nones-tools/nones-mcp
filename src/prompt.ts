import { readFile, stat } from "node:fs/promises";

/** Upper bound for prompt files and stdin so a stray pipe cannot exhaust memory. */
export const MAX_PROMPT_BYTES = 1_000_000;

async function readStdin(): Promise<string> {
  const chunks: Buffer[] = [];
  let bytes = 0;
  for await (const chunk of process.stdin) {
    const buffer = Buffer.from(chunk);
    bytes += buffer.length;
    if (bytes > MAX_PROMPT_BYTES)
      throw new Error("Prompt exceeds the 1 MB limit");
    chunks.push(buffer);
  }
  return Buffer.concat(chunks).toString("utf8");
}

/**
 * Read a prompt before any native mutation. `-` reads stdin; a file path must
 * name a regular file. Empty or oversized prompts fail closed.
 */
export async function readPrompt(source: string): Promise<string> {
  if (!source) throw new Error("Prompt source is required");
  let text: string;
  if (source === "-") {
    text = await readStdin();
  } else {
    let info: Awaited<ReturnType<typeof stat>>;
    try {
      info = await stat(source);
    } catch {
      throw new Error(`Prompt file not found: ${source}`);
    }
    if (!info.isFile())
      throw new Error(`Prompt source is not a file: ${source}`);
    if (info.size > MAX_PROMPT_BYTES)
      throw new Error("Prompt exceeds the 1 MB limit");
    text = await readFile(source, "utf8");
  }
  if (!text.trim()) throw new Error("Prompt is empty");
  if (Buffer.byteLength(text) > MAX_PROMPT_BYTES)
    throw new Error("Prompt exceeds the 1 MB limit");
  return text;
}
