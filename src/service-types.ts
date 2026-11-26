/** Environment map accepted by service startup helpers. */
export interface ServiceEnvironment {
  [name: string]: string | undefined;
}

/** Managed discovery or an explicit pre-existing endpoint. */
export type ServiceSource = "managed" | "explicit";

/** How readiness was proven during the MCP handshake. */
export type ServiceProbeMethod = "tool" | "list";

/** Options for the explicit `server start` operation. */
export interface StartServiceOptions {
  timeoutSeconds?: number | string;
  opencodeBin?: string;
  env?: ServiceEnvironment;
  signal?: AbortSignal;
  probe: ServiceProbe;
  launcher?: ServiceLauncher;
  clock?: ServiceClock;
  probeAttemptMs?: number;
  probeIntervalMs?: number;
  launchAttemptMs?: number;
}

/** Safe-to-print result of a successful startup. */
export interface StartServiceResult {
  status: "ready";
  source: ServiceSource;
  nativeStartRequested: boolean;
  mcpVersion: string;
  serverName?: string;
  protocolVersion?: string;
  readiness: ServiceProbeMethod;
}

/** One bounded MCP readiness attempt. */
export interface ProbeInput {
  timeoutMs: number;
  signal?: AbortSignal;
  env: ServiceEnvironment;
}

export interface ProbeReady {
  ready: true;
  mcpVersion: string;
  serverName?: string;
  protocolVersion?: string;
  method: ServiceProbeMethod;
}

export interface ProbeNotReady {
  ready: false;
  detail?: string;
}

export type ProbeResult = ProbeReady | ProbeNotReady;

export interface ServiceProbe {
  (input: ProbeInput): Promise<ProbeResult>;
}

/** One bounded native launcher invocation. */
export interface LaunchInput {
  command: string;
  args: string[];
  timeoutMs: number;
  signal?: AbortSignal;
  env: ServiceEnvironment;
}

export interface LaunchResult {
  code: number | null;
  stdout: string;
  stderr: string;
  timedOut: boolean;
  aborted?: boolean;
  pid?: number;
}

export interface ServiceLauncher {
  (input: LaunchInput): Promise<LaunchResult>;
}

/** Clock seam so deadline and retry behavior stay deterministic in tests. */
export interface ServiceClock {
  now(): number;
  sleep(milliseconds: number, signal?: AbortSignal): Promise<void>;
}
