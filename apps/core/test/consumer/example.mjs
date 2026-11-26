#!/usr/bin/env node
// Third-party consumer: imports only public @nones/mcp-core exports.
import {
  CliDispatcher,
  JournalSink,
  createActionRegistry,
  createCommanderProgram,
  createToolServer,
  registryTools,
  serveStdio,
} from "@nones/mcp-core";

/** @typedef {{ name: string }} GreetInput */
/** @typedef {{ greeting: string }} GreetOutput */

/** @type {import("@nones/mcp-core").ActionDefinition<GreetInput, GreetOutput>} */
const greet = {
  id: "greet",
  cli: {
    command: "greet",
    description: "print a greeting",
    arguments: [{ name: "name", description: "who to greet" }],
    journal: "example.cli.greet",
    parse: ({ positional }) => ({ name: String(positional[0] ?? "") }),
  },
  tool: {
    name: "example_greet",
    description: "Return a greeting for one name.",
    inputSchema: {
      type: "object",
      properties: { name: { type: "string" } },
      required: ["name"],
      additionalProperties: false,
    },
    annotations: { readOnlyHint: true, openWorldHint: false },
    validate: (raw) => {
      const name = raw?.name;
      if (typeof name !== "string" || name.length === 0)
        throw new Error("name must be a non-empty string");
      return { name };
    },
  },
  handle: async (input, context) => {
    const result = { greeting: `hello ${input.name}` };
    if (context.surface === "cli") console.log(JSON.stringify(result));
    return result;
  },
};

const registry = createActionRegistry("example", [greet]);
const journal = JournalSink.disabled();

if (process.argv.includes("--mcp")) {
  const server = createToolServer({
    name: "third-party-example",
    version: "1.0.0",
    capabilities: { tools: { listChanged: true } },
    tools: registryTools(registry),
    journal,
  });
  await serveStdio(server);
} else if (process.argv.includes("--commander")) {
  const program = createCommanderProgram(registry, {
    name: "example",
    version: "1.0.0",
    journal,
  });
  const index = process.argv.indexOf("--commander");
  const argv = process.argv.slice(index + 1);
  const command = argv[0] === "greet" ? argv : ["greet", ...argv];
  await program.parseAsync(command.length ? command : ["greet", "Ada"], {
    from: "user",
  });
} else {
  const cli = new CliDispatcher(registry, { journal });
  await cli.run(["greet", process.argv[2] ?? "Ada"]);
  await cli.close();
}
