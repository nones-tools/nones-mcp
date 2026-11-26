import type { KaitenSDK } from '../sdk';

/** Dependencies handed to every CLI command (SDK is lazy so `help` works without credentials). */
export interface CliDeps {
  getSdk(): KaitenSDK;
}

/**
 * A self-contained CLI command dispatched by name (or alias) from the
 * registry. `argv` is the full CLI argument vector (`process.argv.slice(2)`,
 * so `argv[0]` is the command name itself and positional args start at 1).
 */
export interface CliCommand {
  name: string;
  aliases?: string[];
  // biome-ignore lint/suspicious/noConfusingVoidType: Promise<void> (not Promise<undefined>) is required for plain `async () => {}` command implementations to type-check.
  run(argv: string[], deps: CliDeps): Promise<number | void>;
}
