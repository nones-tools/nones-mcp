#!/usr/bin/env node

import type { CliDeps } from '../interfaces';
import { KaitenApiError } from '../kaiten';
import { createSDK, type KaitenSDK } from '../sdk';
import { buildRegistry } from './registry';

const args = process.argv.slice(2);
const command = args[0];

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

async function main(): Promise<void> {
  const registry = buildRegistry();
  const cmd = command === undefined ? undefined : registry.get(command);

  if (!cmd) {
    console.error(`Unknown command: ${command}`);
    console.log('Run "kaiten help" for usage information');
    process.exit(1);
  }

  try {
    await cmd.run(args, deps);
  } catch (error) {
    if (error instanceof KaitenApiError) {
      console.error('Error:', error.body ?? error.message);
    } else if (error instanceof Error) {
      console.error('Error:', error.message);
    } else {
      console.error('Error:', error);
    }
    process.exit(1);
  }
}

main();
