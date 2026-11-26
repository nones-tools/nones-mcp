import { Command } from "commander";
import {
  defaultExit,
  dispatch,
  sinkFor,
  type CliSurfaceOptions,
  type DispatcherContext,
} from "./dispatch";
import type { ActionRegistry } from "./registry";
import type { CliExposure } from "./types";

export type { CliSurfaceOptions } from "./dispatch";

export interface CliDispatcherOptions extends CliSurfaceOptions {}

export interface CommanderProgramOptions extends CliSurfaceOptions {
  name: string;
  description?: string;
  version?: string;
}

/** Flat argv dispatcher used by Kaiten-style command tables. */
export class CliDispatcher {
  readonly #registry: ActionRegistry;
  readonly #context: DispatcherContext;
  readonly #owned: boolean;

  constructor(registry: ActionRegistry, options: CliDispatcherOptions = {}) {
    const state = sinkFor(options);
    this.#registry = registry;
    this.#context = {
      integration: registry.integration,
      sink: state.sink,
      options,
    };
    this.#owned = state.owned;
  }

  async run(argv: string[]): Promise<void> {
    const [name] = argv;
    const action = name === undefined ? undefined : this.#registry.command(name);
    if (!action?.cli) {
      const code = this.#context.options.onUnknown?.(name);
      if (typeof code === "number")
        (this.#context.options.setExitCode ?? defaultExit)(code);
      return;
    }
    const exposure = action.cli;
    const input = exposure.parse
      ? exposure.parse({ argv, positional: argv.slice(1), options: {} })
      : { argv };
    await dispatch(this.#context, action, input);
  }

  async close(): Promise<void> {
    if (this.#owned) await this.#context.sink?.close();
  }
}

function addOptions(command: Command, exposure: CliExposure): void {
  for (const arg of exposure.arguments ?? []) {
    command.argument(
      arg.required === false ? `[${arg.name}]` : `<${arg.name}>`,
      arg.description,
    );
  }
  for (const option of exposure.options ?? []) {
    if (option.required) {
      if (option.parse)
        command.requiredOption(
          option.flags,
          option.description ?? "",
          option.parse,
          option.default as never,
        );
      else if (option.default !== undefined)
        command.requiredOption(
          option.flags,
          option.description ?? "",
          option.default as never,
        );
      else command.requiredOption(option.flags, option.description ?? "");
    } else if (option.parse) {
      command.option(
        option.flags,
        option.description ?? "",
        option.parse,
        option.default as never,
      );
    } else if (option.default !== undefined)
      command.option(option.flags, option.description ?? "", option.default as never);
    else command.option(option.flags, option.description ?? "");
  }
}

function commandFor(
  program: Command,
  exposure: CliExposure,
  parents: Map<string, Command>,
): Command {
  const segments = exposure.command.split(" ").filter(Boolean);
  const name = segments.pop() ?? exposure.command;
  let parent = program;
  let trail = "";
  for (const segment of segments) {
    trail = trail ? `${trail} ${segment}` : segment;
    let next = parents.get(trail);
    if (!next) {
      next = program.command(segment);
      parents.set(trail, next);
    }
    parent = next;
  }
  const command = parent.command(name);
  command.description(exposure.description ?? "");
  if (exposure.aliases?.length) command.aliases(exposure.aliases);
  if (exposure.helpText) command.addHelpText("after", exposure.helpText);
  addOptions(command, exposure);
  return command;
}

/**
 * Builds a commander program from explicit CLI exposures. Handlers print their
 * own output; core owns timing, outcome classification and journaling.
 */
export function createCommanderProgram(
  registry: ActionRegistry,
  options: CommanderProgramOptions,
): Command {
  const state = sinkFor(options);
  const context: DispatcherContext = {
    integration: registry.integration,
    sink: state.sink,
    options,
  };
  const program = new Command()
    .name(options.name)
    .description(options.description ?? "");
  if (options.version) program.version(options.version, "-V, --version");
  const parents = new Map<string, Command>();
  for (const action of registry.actions) {
    const exposure = action.cli;
    if (!exposure) continue;
    const command = commandFor(program, exposure, parents);
    command.action((...received: unknown[]) => {
      received.pop();
      const parsedOptions = (received.pop() ?? {}) as Record<string, unknown>;
      const positional = received;
      const input = exposure.parse
        ? exposure.parse({
            argv: [exposure.command, ...positional.map(String)],
            positional,
            options: parsedOptions,
          })
        : parsedOptions;
      return dispatch(context, action, input);
    });
  }
  if (state.owned) {
    program.hook("postAction", async () => {
      await state.sink.close();
    });
  }
  return program;
}
