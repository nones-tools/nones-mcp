// Core-internal parsing helpers for src/kaiten/config.ts. Not part of the
// public surface (not re-exported from src/kaiten/index.ts) - kept out of
// config.ts purely to respect the 200-line-per-file rule.

/**
 * Comma-separated integer list. Whitespace around entries is ignored; blank
 * or non-numeric entries are dropped (with a warning naming `varName`).
 * Unset, empty, or garbage-only input -> `null` (never "allow nothing").
 */
export function parseIntList(value: string | undefined, varName: string): number[] | null {
  if (!value) return null;
  const entries = value.split(',').map((entry) => entry.trim());
  const ids: number[] = [];
  let hadInvalid = false;
  for (const entry of entries) {
    const id = entry ? parseInt(entry, 10) : NaN;
    if (Number.isNaN(id)) {
      hadInvalid = true;
    } else {
      ids.push(id);
    }
  }
  if (hadInvalid) console.error(`Ignoring malformed entries in ${varName} (expected comma-separated integers)`);
  return ids.length > 0 ? ids : null;
}

/**
 * Comma-separated name list (e.g. tool names). Whitespace trimmed; blank
 * entries dropped (with a warning naming `varName`). Empty/unset -> `null`.
 */
export function parseNameList(value: string | undefined, varName: string): string[] | null {
  if (!value) return null;
  const entries = value.split(',').map((entry) => entry.trim());
  const names = entries.filter((entry) => entry.length > 0);
  if (names.length !== entries.length) {
    console.error(`Ignoring blank entries in ${varName} (expected comma-separated names)`);
  }
  return names.length > 0 ? names : null;
}

/**
 * Boolean flag: only the exact string `'true'` (case-insensitive, trimmed)
 * enables. Anything else (including `'1'`, `'yes'`, unset) is `false`.
 */
export function parseBool(value: string | undefined): boolean {
  return (value ?? '').trim().toLowerCase() === 'true';
}

/**
 * Strictly positive integer. Missing/non-numeric/zero/negative -> `null`
 * with a warning naming `varName`.
 */
export function parsePositiveInt(value: string | undefined, varName: string): number | null {
  if (!value) return null;
  const parsed = parseInt(value.trim(), 10);
  if (Number.isNaN(parsed) || parsed <= 0) {
    console.error(`Ignoring invalid ${varName} (expected a positive integer): ${JSON.stringify(value)}`);
    return null;
  }
  return parsed;
}

/**
 * Non-negative integer (zero allowed). Missing/non-numeric/negative -> `null`
 * with a warning naming `varName`.
 */
export function parseNonNegativeInt(value: string | undefined, varName: string): number | null {
  if (!value) return null;
  const parsed = parseInt(value.trim(), 10);
  if (Number.isNaN(parsed) || parsed < 0) {
    console.error(`Ignoring invalid ${varName} (expected a non-negative integer): ${JSON.stringify(value)}`);
    return null;
  }
  return parsed;
}
