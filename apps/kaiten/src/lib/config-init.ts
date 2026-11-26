import fs from 'fs';
import os from 'os';
import path from 'path';

interface Credentials {
  apiUrl: string;
  apiToken: string;
}

function upsertValues(content: string, values: Record<string, string>): string {
  for (const value of Object.values(values)) {
    if (/[\r\n]/.test(value)) throw new Error('Kaiten configuration values must not contain newlines.');
  }

  const remaining = new Set(Object.keys(values));
  const output: string[] = [];
  const lines = content.replace(/\r\n/g, '\n').split('\n');
  if (lines.at(-1) === '') lines.pop();

  for (const line of lines) {
    const key = line.match(/^\s*([A-Za-z_][A-Za-z0-9_]*)\s*=/)?.[1];
    if (!key || !(key in values)) {
      output.push(line);
      continue;
    }
    if (remaining.delete(key)) output.push(`${key}=${values[key]}`);
  }

  for (const key of remaining) output.push(`${key}=${values[key]}`);
  return `${output.join('\n')}\n`;
}

export function getGlobalConfigPath(homeDir = os.homedir()): string {
  return path.join(homeDir, '.kaiten', 'config');
}

/**
 * Persists only the two credentials needed by every Kaiten process. Existing
 * defaults and guardrails in the global config are preserved.
 */
export function saveGlobalCredentials(credentials: Credentials, filePath = getGlobalConfigPath()): string {
  const directory = path.dirname(filePath);
  fs.mkdirSync(directory, { recursive: true, mode: 0o700 });

  let current = '';
  try {
    current = fs.readFileSync(filePath, 'utf8');
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code !== 'ENOENT') throw error;
  }

  const updated = upsertValues(current, {
    KAITEN_API_URL: credentials.apiUrl,
    KAITEN_API_TOKEN: credentials.apiToken,
  });
  const tempPath = `${filePath}.${process.pid}.tmp`;

  try {
    fs.writeFileSync(tempPath, updated, { encoding: 'utf8', mode: 0o600 });
    fs.renameSync(tempPath, filePath);
    fs.chmodSync(filePath, 0o600);
  } finally {
    fs.rmSync(tempPath, { force: true });
  }

  return filePath;
}
