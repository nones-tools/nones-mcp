import { Client } from "@modelcontextprotocol/client";
import { StdioClientTransport } from "@modelcontextprotocol/client/stdio";
import path from "node:path";
import { canceledError, sanitizeServiceDetail } from "./service-errors";
import type {
  ProbeInput,
  ProbeResult,
  ServiceEnvironment,
  ServiceProbe,
} from "./service-types";

const INFO_TOOL = "opencode_server_info";
const DEFAULT_MAX_BUFFER = 1_000_000;

export interface McpProbeOptions {
  command: string;
  args?: string[];
  env?: ServiceEnvironment;
  cwd?: string;
  runtime?: "bun" | "node";
  maxBufferSize?: number;
}

function bunCommand(command: string): boolean {
  const name = path.basename(command).toLowerCase();
  return (
    name === "bun" ||
    name === "bun.exe" ||
    (name.startsWith("bun") && command === process.execPath)
  );
}

function runtimeFor(options: McpProbeOptions): "bun" | "node" {
  if (options.runtime) return options.runtime;
  return process.versions.bun && bunCommand(options.command) ? "bun" : "node";
}

/** Append the packaged CLI's `mcp` argument, keeping Bun env-file behavior. */
export function probeArguments(
  args: string[],
  runtime: "bun" | "node",
): string[] {
  return [...(runtime === "bun" ? ["--no-env-file"] : []), ...args, "mcp"];
}

function environment(env: ServiceEnvironment): { [name: string]: string } {
  return Object.fromEntries(
    Object.entries(env).filter(
      (entry): entry is [string, string] => typeof entry[1] === "string",
    ),
  );
}

export function createMcpProbe(options: McpProbeOptions): ServiceProbe {
  return (input) => runProbe(options, input);
}

async function inspect(
  client: Client,
  transport: StdioClientTransport,
  timeoutMs: number,
  signal: AbortSignal,
): Promise<ProbeResult> {
  await client.connect(transport, { timeout: timeoutMs, signal });
  const listed = await client.listTools(
    {},
    { timeout: timeoutMs, signal, cacheMode: "bypass" },
  );
  if (!listed.tools.some((tool) => tool.name === INFO_TOOL))
    return {
      ready: false,
      detail: `MCP tools/list did not contain ${INFO_TOOL}`,
    };
  const server = client.getServerVersion();
  const protocolVersion = client.getNegotiatedProtocolVersion();
  const ready: ProbeResult = {
    ready: true,
    mcpVersion: server?.version || "unknown",
    ...(server?.name ? { serverName: server.name } : {}),
    ...(protocolVersion ? { protocolVersion } : {}),
    method: "tool",
  };
  try {
    const called = await client.callTool(
      { name: INFO_TOOL, arguments: {} },
      { timeout: timeoutMs, signal },
    );
    if (called.isError)
      return {
        ready: false,
        detail: `${INFO_TOOL} returned isError from tools/call`,
      };
    return ready;
  } catch (error) {
    // Abort/timeout must not be mistaken for a usable readiness result.
    if (signal.aborted) throw error;
    const detail = sanitizeServiceDetail(error);
    return {
      ready: false,
      detail: `${INFO_TOOL} call failed${detail ? `: ${detail}` : ""}`,
    };
  }
}

const CLOSE_GRACE_MS = 500;

function delay(milliseconds: number): Promise<void> {
  return new Promise((resolve) => {
    const timer = setTimeout(resolve, milliseconds);
    timer.unref?.();
  });
}

async function closeProbe(
  client: Client,
  transport: StdioClientTransport,
  pid?: number,
): Promise<void> {
  let closed = false;
  const closing = (async () => {
    await client.close().catch(() => {});
    await transport.close().catch(() => {});
    closed = true;
  })();
  await Promise.race([closing, delay(CLOSE_GRACE_MS)]);
  if (closed || !pid) return;
  try {
    process.kill(pid, "SIGKILL");
  } catch {}
  await Promise.race([closing, delay(250)]);
}

function terminateProbe(transport: StdioClientTransport): void {
  const pid = transport.pid;
  if (pid) {
    try {
      process.kill(pid, "SIGTERM");
    } catch {}
  }
}

async function runProbe(
  options: McpProbeOptions,
  input: ProbeInput,
): Promise<ProbeResult> {
  if (input.signal?.aborted) throw canceledError(input.signal);
  const timeoutMs = Math.max(1, input.timeoutMs);
  const controller = new AbortController();
  const transport = new StdioClientTransport({
    command: options.command,
    args: probeArguments(options.args ?? [], runtimeFor(options)),
    env: environment(input.env ?? options.env ?? process.env),
    ...(options.cwd ? { cwd: options.cwd } : {}),
    stderr: "pipe",
    maxBufferSize: options.maxBufferSize ?? DEFAULT_MAX_BUFFER,
  });
  transport.stderr?.on("data", () => {});
  const onAbort = () => {
    terminateProbe(transport);
    controller.abort(input.signal?.reason);
  };
  input.signal?.addEventListener("abort", onAbort, { once: true });
  const client = new Client({
    name: "opencode-mcp-readiness",
    version: "0.5.0",
  });
  let timer: ReturnType<typeof setTimeout> | undefined;
  try {
    const guard = new Promise<ProbeResult>((_, reject) => {
      timer = setTimeout(() => {
        terminateProbe(transport);
        controller.abort(new Error("MCP readiness timed out"));
        reject(new Error("MCP readiness timed out"));
      }, timeoutMs);
    });
    return await Promise.race([
      inspect(client, transport, timeoutMs, controller.signal),
      guard,
    ]);
  } catch (error) {
    if (input.signal?.aborted) throw canceledError(input.signal);
    return { ready: false, detail: sanitizeServiceDetail(error) };
  } finally {
    clearTimeout(timer);
    input.signal?.removeEventListener("abort", onAbort);
    await closeProbe(client, transport, transport.pid ?? undefined);
  }
}
