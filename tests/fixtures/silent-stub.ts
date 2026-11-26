import { writeFileSync } from "node:fs";

const pidFile = process.env.STUB_PID_FILE;
if (pidFile) writeFileSync(pidFile, String(process.pid));
process.stdin.resume();
setInterval(() => {}, 1000);
