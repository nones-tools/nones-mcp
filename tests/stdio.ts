import { spawn } from "node:child_process";

const timeoutMs = 5000;

export function startCli(
	command: string,
	env: NodeJS.ProcessEnv = {},
): ReturnType<typeof spawn> {
	return spawn(
		"node",
		[process.env.OPENCODE_MCP_TEST_CLI || "dist/cli.js", command],
		{
			env: { ...process.env, ...env },
			stdio: ["pipe", "pipe", "pipe"],
		},
	);
}

export function waitForMessages(
	child: ReturnType<typeof spawn>,
	ready: (messages: any[]) => boolean,
): Promise<any[]> {
	let buffer = "";
	const messages: any[] = [];
	const stdout = child.stdout;
	if (!stdout) return Promise.reject(new Error("Missing stdout"));
	return new Promise((resolve, reject) => {
		const timer = setTimeout(() => {
			cleanup();
			reject(new Error("MCP child timed out"));
		}, timeoutMs);
		const cleanup = () => {
			clearTimeout(timer);
			stdout.off("data", onData);
			child.off("error", onError);
		};
		const onError = (error: Error) => {
			cleanup();
			reject(error);
		};
		const onData = (chunk: Buffer) => {
			buffer += chunk.toString();
			const lines = buffer.split("\n");
			buffer = lines.pop() ?? "";
			for (const line of lines)
				if (line.trim()) messages.push(JSON.parse(line));
			if (ready(messages)) {
				cleanup();
				resolve(messages);
			}
		};
		stdout.on("data", onData);
		child.on("error", onError);
	});
}

export function waitForExit(
	child: ReturnType<typeof spawn>,
): Promise<{ code: number | null; stdout: string; stderr: string }> {
	let stdout = "";
	let stderr = "";
	child.stdout?.on("data", (chunk: Buffer) => (stdout += chunk.toString()));
	child.stderr?.on("data", (chunk: Buffer) => (stderr += chunk.toString()));
	return new Promise((resolve, reject) => {
		const timer = setTimeout(() => {
			child.kill();
			reject(new Error("CLI child timed out"));
		}, timeoutMs);
		child.on("error", (error) => {
			clearTimeout(timer);
			reject(error);
		});
		child.on("close", (code) => {
			clearTimeout(timer);
			resolve({ code, stdout, stderr });
		});
	});
}
