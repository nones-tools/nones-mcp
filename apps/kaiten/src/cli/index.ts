#!/usr/bin/env node

import {
  CliDispatcher,
  createActionRegistry,
  isExcludedCommand,
  type ActionDefinition,
} from '@nones/mcp-core';
import type { CliDeps } from '../interfaces';
import { KaitenApiError } from '../kaiten';
import { createSDK, type KaitenSDK } from '../sdk';
import { buildRegistry, commands } from './registry';

const args = process.argv.slice(2);

// Config/SDK are constructed lazily (only by commands that need them) so
// that `help` and unrecognized commands work without KAITEN_* credentials
// configured. The old CLI built these eagerly at module load, which meant
// `kaiten help` crashed if no config was present - that's the one
// behavioral fix in this port.
let cachedSdk: KaitenSDK | undefined;
const deps: CliDeps = {
  getSdk(): KaitenSDK {
    if (!cachedSdk) cachedSdk = createSDK();
    return cachedSdk;
  },
};

function printError(error: unknown): void {
  if (error instanceof KaitenApiError) {
    console.error('Error:', error.body ?? error.message);
  } else if (error instanceof Error) {
    console.error('Error:', error.message);
  } else {
    console.error('Error:', error);
  }
}

async function main(): Promise<void> {
  // Preserve the duplicate-name guard and its exact error before exposing
  // handlers through the shared CLI surface.
  buildRegistry();
  const registry = createActionRegistry(
    'kaiten',
    commands.map(
      (command): ActionDefinition => ({
        id: command.name,
        cli: {
          command: command.name,
          ...(command.aliases === undefined ? {} : { aliases: command.aliases }),
          journal: isExcludedCommand(command.name) ? false : undefined,
          parse: ({ argv }) => ({ argv }),
        },
        handle: (input) => command.run((input as { argv: string[] }).argv, deps),
      }),
    ),
  );
  const cli = new CliDispatcher(registry, {
    onUnknown: (name) => {
      console.error(`Unknown command: ${name}`);
      console.log('Run "kaiten help" for usage information');
      return 1;
    },
    onError: (error) => {
      printError(error);
      // Set the exit code instead of exiting inside the dispatcher: journaling
      // has already recorded the failure, and the finally block must still
      // close the owned sink.
      process.exitCode = 1;
    },
  });
  try {
    await cli.run(args);
  } finally {
    await cli.close();
  }
}

main();
