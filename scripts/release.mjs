#!/usr/bin/env node
/** Thin dispatcher; release logic lives under scripts/release/. */
import path from "node:path";
import { fileURLToPath } from "node:url";
import { main } from "./release/cli.mjs";
import { sanitizeOutput } from "./release/runner.mjs";

const invokedPath = process.argv[1] ? path.resolve(process.argv[1]) : "";
if (invokedPath === fileURLToPath(import.meta.url)) {
  main().catch((error) => {
    console.error(sanitizeOutput(error?.message ?? error));
    process.exitCode = 1;
  });
}
