/**
 * Versioned module contract between @nones/mcp-core and installed adapters.
 *
 * Adapters are ordinary packages: the core resolves them from its own
 * dependency tree (never from the current working directory) and refuses a
 * module whose `apiVersion` or `id` does not match the trusted allowlist.
 */
export const MODULE_API_VERSION = 1 as const;

import type { JournalSettings } from "./journal";

export type JsonSchema = Record<string, unknown>;

export type TaskSupport = "required" | "optional" | "forbidden";

export interface ToolAnnotations {
  title?: string;
  readOnlyHint?: boolean;
  destructiveHint?: boolean;
  idempotentHint?: boolean;
  openWorldHint?: boolean;
}

/** Verbatim tool metadata. Core re-exposes it without renaming or reshaping. */
export interface ToolDefinition {
  name: string;
  title?: string;
  description?: string;
  inputSchema: JsonSchema;
  outputSchema?: JsonSchema;
  annotations?: ToolAnnotations;
  execution?: { taskSupport?: TaskSupport };
  icons?: unknown[];
  _meta?: Record<string, unknown>;
}

export interface ToolContent {
  type: string;
  [key: string]: unknown;
}

/** Result envelope forwarded to the MCP client unchanged. */
export interface ToolCallResult {
  content: ToolContent[];
  structuredContent?: unknown;
  isError?: boolean;
  _meta?: Record<string, unknown>;
}

export interface ToolCallOptions {
  /** Aborted when the caller cancels or the core shuts down. */
  signal: AbortSignal;
}

export interface ModuleTool {
  definition: ToolDefinition;
  call(args: Record<string, unknown>, options: ToolCallOptions): Promise<ToolCallResult>;
}

export interface ModuleRuntime {
  tools: ModuleTool[];
  /** Must be idempotent and close every child process or socket it owns. */
  close(): Promise<void>;
}

export type LogLevel = "debug" | "info" | "warn" | "error";

export interface Logger {
  debug(message: string, fields?: Record<string, unknown>): void;
  info(message: string, fields?: Record<string, unknown>): void;
  warn(message: string, fields?: Record<string, unknown>): void;
  error(message: string, fields?: Record<string, unknown>): void;
}

export interface ModulePermissions {
  destructive: boolean;
  admin: boolean;
  exec: boolean;
}

/** Per-module file: modules/<id>.json. Never shared with another module. */
export interface ModuleConfig {
  version: 1;
  enabled: boolean;
  permissions: ModulePermissions;
  /** Literal, non-credential environment entries for the module child. */
  env: Record<string, string>;
  /** Child variable -> parent variable reference; resolved at startup. */
  envFrom: Record<string, string>;
  /** Module-specific, validated by the adapter. */
  options: Record<string, unknown>;
}

export interface SharedConfig {
  version: 1;
  /** Ordered list of enabled module ids; the only place enablement is declared. */
  modules: string[];
  logLevel: LogLevel;
}

/** Read-only snapshot handed to modules; contains no journal control. */
export interface SharedConfigView {
  logLevel: LogLevel;
  moduleId: string;
}

export interface ModuleContext {
  id: string;
  version: string;
  /** Module-scoped config only. */
  config: ModuleConfig;
  /** Resolved envFrom + env, already filtered and validated. */
  env: Readonly<Record<string, string>>;
  shared: SharedConfigView;
  journal: Readonly<JournalSettings>;
  /** Private, mode-0700 directory owned by this module. */
  stateDir: string;
  logger: Logger;
  /** Aborted on core shutdown; modules should stop accepting work. */
  signal: AbortSignal;
}

export interface ToolModule {
  readonly apiVersion: typeof MODULE_API_VERSION;
  readonly id: string;
  readonly version: string;
  /** Host package this adapter wraps, for diagnostics and support reports. */
  readonly host: { name: string; version: string };
  start(context: ModuleContext): Promise<ModuleRuntime>;
}

/** Stable error codes surfaced by core and adapters. */
export const ModuleErrorCode = {
  ConfigInvalid: "CONFIG_INVALID",
  ModuleUnavailable: "MODULE_UNAVAILABLE",
  ModuleIncompatible: "MODULE_INCOMPATIBLE",
  ModuleStartFailed: "MODULE_START_FAILED",
  DuplicateTool: "DUPLICATE_TOOL",
  ChildError: "CHILD_ERROR",
  ChildExited: "CHILD_EXITED",
  AsyncTaskUnsupported: "ASYNC_TASK_UNSUPPORTED",
} as const;

export type ModuleErrorCodeValue =
  (typeof ModuleErrorCode)[keyof typeof ModuleErrorCode];

/**
 * Error that keeps the wrapped child's JSON-RPC code when there is one.
 * Adapters may construct this class from a separately bundled copy of core, so
 * core also recognises it by name instead of relying on `instanceof`.
 */
export class ModuleError extends Error {
  constructor(
    readonly code: ModuleErrorCodeValue,
    message: string,
    readonly jsonRpcCode?: number,
    readonly data?: unknown,
  ) {
    super(message);
    this.name = "ModuleError";
  }
}

export interface ModuleErrorLike {
  name: string;
  code: string;
  message: string;
  jsonRpcCode?: number;
  data?: unknown;
}

export function isModuleError(error: unknown): error is ModuleErrorLike {
  if (!(error instanceof Error) || error.name !== "ModuleError") return false;
  const candidate = error as Partial<ModuleErrorLike>;
  return typeof candidate.code === "string" && candidate.code.length > 0;
}
