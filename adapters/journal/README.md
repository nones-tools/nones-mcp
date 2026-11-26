# @nones/journal

Adapter collection for the `@nones` MCP suite. SQLite is the built-in adapter,
published as the typed `@nones/journal/sqlite` subpath; future adapters can be
added as sibling subpaths without changing this one.

```ts
import sqlite, { openSqliteJournal } from "@nones/journal/sqlite";

const journal = await openSqliteJournal("/absolute/path/journal.sqlite");
await journal.record({
  id: "operation-1",
  at: new Date().toISOString(),
  operation: "opencode.session.send",
  outcome: "success",
  durationMs: 12,
});
await journal.close();

// Equivalent through the custom-adapter v1 factory (the default export).
const fromFactory = await sqlite.create({ path: "/absolute/path/journal.sqlite" });
```

## Public exports (`@nones/journal/sqlite`)

- Default: `adapterFactory` — the API v1 custom-adapter factory
  `{ apiVersion: 1, create(options) }`.
- Named: `openSqliteJournal`, `adapterFactory`, `JournalError`, `SCHEMA_VERSION`,
  `APPLICATION_ID`.
- Types: `JournalErrorCode`, `JournalAdapter`, `JournalAdapterFactory`,
  `JournalFilter`, `JournalPage`, `JournalQuery`, `JournalRecord`,
  `JournalRecordResult`, `JournalStats`.

## Boundaries

- Schema is unchanged from 0.5.0: `journal_entries`, `application_id` `OMJ1`
  (`0x4f4d4a31`), `user_version` 1, WAL mode. Existing databases reopen and are
  read without migration.
- New files are created `0600` inside a `0700` directory; existing files are
  never chmodded. Group/other access fails closed.
- Journal policy, validation, limits, errors and cursors are owned by core.
  The adapter imports them from the side-effect-free
  `@nones/mcp-core/journal` subpath instead of copying them.
- The adapter never downloads anything and never owns configuration.

See `docs/adapters/sqlite.md` and the repository `ARCHITECTURE.md`.
