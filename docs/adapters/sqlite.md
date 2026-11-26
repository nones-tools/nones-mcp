# SQLite journal adapter (design, not implemented)

Status: **contract and migration design only**. `@nones/mcp-core` validates the
settings and never opens a database. The implementation is being written as
part of OpenCode 0.5.0 and will be extracted after that release.

## Why it is separate

The journal is cross-cutting state, not module state. It must not be reachable
through module config, and a module must not be able to point it at another
module's database. Core owns the settings; one adapter owns the file.

## Configuration compatibility

Standalone OpenCode 0.5.0 already reads
`$XDG_CONFIG_HOME/nones/config.json` (default `~/.config/nones/config.json`)
with a top-level object:

```json
{
  "journal": {
    "enabled": true,
    "capturePrompts": false,
    "sqlitePath": "/absolute/path/journal.sqlite",
    "adapter": { "module": "sqlite", "options": {} }
  }
}
```

Core accepts this unchanged, including when `journal` is the only key. An
optional `journal.json` with the same fields may replace it; when both exist
`journal.json` wins and a warning is logged. `enabled: true` is accepted during
the prototype but intentionally not acted on.

## Contract

```ts
interface JournalRecord {
  id: string;
  recordedAt: string;
  moduleId: string;
  kind: string;
  payload: unknown;
}

interface JournalAdapter {
  readonly kind: "sqlite";
  open(settings: Readonly<JournalSettings>): Promise<void>;
  append(record: JournalRecord): Promise<void>;
  close(): Promise<void>;
}
```

Core never writes records itself. When the adapter lands, modules receive a
journal facade from core, and only core decides when to append.

## Storage sketch

- `journal` table: `id TEXT PRIMARY KEY`, `recorded_at TEXT NOT NULL`,
  `module_id TEXT NOT NULL`, `kind TEXT NOT NULL`, `payload TEXT NOT NULL`
  (JSON), plus indexes on `(module_id, recorded_at)` and `(kind, recorded_at)`.
- `meta` table: schema version and writer identity for migration checks.
- WAL mode, `synchronous=NORMAL`, busy timeout; one process owns the file.
- Absolute `sqlitePath` only; parent directory must exist and not be a symlink
  escape. File mode `0600` on creation.
- `capturePrompts: false` stores metadata only. When true, prompt text is
  stored but still passes through the same secret scrubber used for logs;
  credentials and URL userinfo are never persisted.

## Single-writer rule

The standalone 0.5.0 process and the module must not both open the journal.
Cutover is explicit:

1. standalone 0.5.0 keeps writing while the module journal is disabled;
2. operator flips `journal.adapter.module` to the module and stops the
   standalone writer (or vice versa);
3. the adapter refuses to open when it detects a second live writer lock.

No dual-write, no background replication, no silent migration.

## Extraction plan after 0.5.0

1. Capture the published 0.5.0 schema and settings reader as fixtures.
2. Move the storage code behind `JournalAdapter` in `adapters/sqlite`;
   keep OpenCode's settings keys unchanged.
3. Add compatibility tests: legacy-only config, dedicated `journal.json`,
   disabled journal creates no file, enabled journal opens exactly once,
   second writer fails, `capturePrompts` toggles content storage.
4. Keep the standalone package as the fallback entrypoint for one minor
   release; publishing the adapter does not deprecate it.
5. Gate any real config change on the tests above plus a rollback rehearsal.

## Non-goals for the prototype

- Creating the database, running migrations or writing any record.
- Reading historical OpenCode journals.
- Exposing journal contents as MCP tools.
- Storing credentials, tokens or unredacted prompt payloads by default.
