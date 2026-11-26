import { spawn } from "node:child_process";
import { existsSync } from "node:fs";
import { fileURLToPath } from "node:url";

const args = process.argv.slice(2);
if (args.join(" ") !== "service start") {
  console.error("synthetic opencode only supports: service start");
  process.exit(64);
}
const registration = process.env.SYNTHETIC_SERVICE_FILE;
if (!registration) {
  console.error("SYNTHETIC_SERVICE_FILE is required");
  process.exit(64);
}

const service = spawn(
  process.execPath,
  [fileURLToPath(new URL("./synthetic-service.mjs", import.meta.url))],
  {
    detached: true,
    stdio: "ignore",
    env: { ...process.env, SYNTHETIC_SERVICE_FILE: registration },
  },
);
service.unref();

const deadline = Date.now() + 4000;
while (!existsSync(registration) && Date.now() < deadline)
  await new Promise((resolve) => setTimeout(resolve, 50));

if (!existsSync(registration)) {
  console.error("synthetic service did not register");
  process.exit(1);
}
process.exit(0);
