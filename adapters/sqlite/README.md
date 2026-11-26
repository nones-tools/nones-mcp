# @nones/mcp-journal-sqlite

SQLite journal adapter implementing the `@nones/mcp-core` journal API v1
(`record`, `query`, `stats`, `close`). Extracted from OpenCode 0.5.0.

```ts
import { openSqliteJournal } from "@nones/mcp-journal-sqlite";

const journal = await openSqliteJournal("/absolute/path/journal.sqlite");
await journal.record({
  id: "operation-1",
  at: new Date().toISOString(),
  operation: "opencode.session.send",
  outcome: "success",
  durationMs: 12,
});
await journal.close();
```

- Schema is unchanged from 0.5.0: `journal_entries`, `application_id` `OMJ1`,
  `user_version` 1, WAL mode. Existing databases reopen without migration.
- Default export is the custom-adapter v1 factory:
  `{ apiVersion: 1, create({ path }) }`.
- New files are created `0600` inside a `0700` directory; existing files are
  never chmodded. Group/other access fails closed.
- Cursors and validation match core, so reads behave identically through the
  standalone CLI and the aggregate server.
- The adapter never downloads anything. It reuses the single versioned
  implementations of validation, limits, errors and cursors through the
  side-effect-free `@nones/mcp-core/journal` subpath instead of copying them.

See `docs/adapters/sqlite.md` and the repository `ARCHITECTURE.md`.
