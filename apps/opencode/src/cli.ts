#!/usr/bin/env node
import { fileURLToPath } from "node:url";
import { createCliProgram } from "./cli-program";

const cliPath = fileURLToPath(import.meta.url);
const program = createCliProgram(cliPath);

const args = process.argv.slice(2);
await program.parseAsync(args.length ? args : ["mcp"], { from: "user" });
