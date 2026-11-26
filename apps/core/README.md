# @nones/mcp-core

Single stdio MCP entry (`nones-mcp`) that hosts explicitly installed `@nones`
module adapters. Public interfaces live in `src/types.ts`; the versioned module
API is `apiVersion: 1`.

- Config directory: `$NONES_CONFIG_DIR`, `$XDG_CONFIG_HOME/nones`, or
  `~/.config/nones`.
- `config.json` is shared; `modules/<id>.json` is private to one module.
- The legacy standalone OpenCode 0.5.0 top-level `journal` object is accepted
  and never opened by this prototype.
- No module is loaded from CWD, config paths or runtime downloads.

```sh
node dist/bin.js doctor
node dist/bin.js   # serves stdio MCP
```

See the repository `ARCHITECTURE.md` for the migration plan and trust model.
