// Runs every package suite with an isolated HOME so user config cannot affect
// results. Credential-like ambient variables are removed before spawning.
import { mkdirSync } from "node:fs";
import { spawnSync } from "node:child_process";
import path from "node:path";

const root = path.resolve(import.meta.dir, "..");
const home = path.join(root, ".tmp", "test-home");
mkdirSync(home, { recursive: true });

const env: Record<string, string | undefined> = {
  ...process.env,
  HOME: home,
  XDG_CONFIG_HOME: path.join(home, ".config"),
  XDG_STATE_HOME: path.join(home, ".local", "state"),
  TMPDIR: path.join(root, ".tmp"),
};
for (const key of Object.keys(env)) {
  if (key.startsWith("KAITEN_") || key.startsWith("OPENCODE_")) delete env[key];
}

const suites: Array<{ cwd: string; args: string[] }> = [
  { cwd: root, args: ["test", "apps/core/test"] },
  { cwd: path.join(root, "apps/kaiten"), args: ["test"] },
  { cwd: path.join(root, "apps/opencode"), args: ["test"] },
  { cwd: path.join(root, "adapters/journal"), args: ["test"] },
];

for (const suite of suites) {
  const label = path.relative(root, suite.cwd) || "core";
  console.log(`\n=== tests: ${label} ===`);
  const result = spawnSync("bun", suite.args, {
    cwd: suite.cwd,
    env,
    stdio: "inherit",
  });
  if (result.status !== 0) process.exit(result.status ?? 1);
}
