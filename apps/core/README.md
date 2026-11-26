# @nones/mcp-core

Shared runtime for the `@nones` MCP suite: explicit action registry, CLI
dispatch, stdio MCP server and journal. The aggregate `nones-mcp` entry hosts
explicitly installed `@nones` modules; the module API is `apiVersion: 1`.

## Registry

Declare an action once and expose it explicitly to the CLI, MCP or both.
Duplicate ids, commands, aliases and tool names fail closed.

```ts
import {
  createActionRegistry,
  createToolServer,
  registryTools,
  serveStdio,
  type ActionDefinition,
} from "@nones/mcp-core";

interface GreetInput {
  name: string;
}
interface GreetOutput {
  greeting: string;
}

const greet: ActionDefinition<GreetInput, GreetOutput> = {
  id: "greet",
  cli: { command: "greet", journal: false },
  tool: {
    name: "greet",
    description: "Greet one person.",
    inputSchema: {
      type: "object",
      properties: { name: { type: "string" } },
      required: ["name"],
      additionalProperties: false,
    },
    validate: (raw) => {
      const name = (raw as { name?: unknown } | null)?.name;
      if (typeof name !== "string" || name.length === 0)
        throw new Error("name must be a non-empty string");
      return { name };
    },
  },
  handle: async (input) => ({ greeting: `hello ${input.name}` }),
};

const registry = createActionRegistry("example", [greet]);
const server = createToolServer({
  name: "example-mcp",
  tools: registryTools(registry),
});
await serveStdio(server);
```

`createCommanderProgram` and `CliDispatcher` bind the same definitions to a CLI.
`ToolServerOptions.journal` injects the journal sink; omit it to disable
journaling.

## Journal

Core owns the journal contract, config resolution and policy. The aggregate
`nones-mcp` server and both standalone servers (`@nones/kaiten-mcp`,
`@nones/opencode-mcp`) record MCP tool calls through core by injecting a
`JournalSink`. Third-party servers built with `createToolServer` opt in by
passing `ToolServerOptions.journal`; omitting it disables journaling.

The built-in SQLite adapter is published as `@nones/journal/sqlite`; the
retired `@nones/mcp-journal-sqlite` name survives only as a config migration
alias. Both standalone packages carry `@nones/mcp-core` in their dependencies,
so one shared core instance owns the contract, server and journal boundary.

## Configuration

- Config directory: `$NONES_CONFIG_DIR`, `$XDG_CONFIG_HOME/nones`, or
  `~/.config/nones`.
- `config.json` is shared; `modules/<id>.json` is private to one module.
- The OpenCode 0.5.0 top-level `journal` object is accepted.
- Installed modules resolve from core's dependency tree; nothing is downloaded
  at runtime and config cannot name arbitrary code.

```sh
node dist/bin.js doctor
node dist/bin.js   # serves stdio MCP
```

See the repository `ARCHITECTURE.md` for the migration plan and trust model.
