import { ServiceStartError } from "../src/service-errors";
import type {
  LaunchInput,
  LaunchResult,
  ProbeResult,
  ServiceClock,
} from "../src/service-types";

export function fakeClock(): ServiceClock {
  let time = 0;
  return {
    now: () => time,
    sleep: async (milliseconds, signal) => {
      if (signal?.aborted) throw new Error("aborted");
      time += milliseconds;
    },
  };
}

export function ready(version = "0.5.0"): ProbeResult {
  return {
    ready: true,
    mcpVersion: version,
    serverName: "opencode-mcp",
    protocolVersion: "2025-06-18",
    method: "tool",
  };
}

export function recordingLauncher(result: LaunchResult): {
  launcher: (input: LaunchInput) => Promise<LaunchResult>;
  calls: LaunchInput[];
} {
  const calls: LaunchInput[] = [];
  return {
    calls,
    launcher: async (input) => {
      calls.push(input);
      return result;
    },
  };
}

export async function failure(
  promise: Promise<unknown>,
): Promise<ServiceStartError> {
  try {
    await promise;
  } catch (error) {
    if (error instanceof ServiceStartError) return error;
    throw error;
  }
  throw new Error("Expected startup to fail");
}
