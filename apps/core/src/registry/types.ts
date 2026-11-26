import type { JournalMetadata, JournalOutcome } from "../journal/index";
import type {
  JsonSchema,
  TaskSupport,
  ToolAnnotations,
  ToolCallResult,
} from "../types";

export type ActionSurface = "cli" | "mcp";

export interface ActionContext {
  surface: ActionSurface;
  /** Present for MCP calls; aborted when the client cancels. */
  signal?: AbortSignal;
}

export interface CliArgumentSpec {
  name: string;
  description?: string;
  required?: boolean;
}

export interface CliOptionSpec {
  /** Commander flags, e.g. "-C, --directory <path>". */
  flags: string;
  description?: string;
  required?: boolean;
  default?: string | boolean | number;
  /** Commander value parser; throw to reject the value. */
  parse?: (value: string) => unknown;
}

export interface CliParseInput {
  /** Full argv including the command, as a flat dispatcher received it. */
  argv: string[];
  /** Positional values already split by the surface. */
  positional: unknown[];
  /** Parsed options (defaults applied). */
  options: Record<string, unknown>;
}

/** A CLI exposure is inert metadata; handlers still print their own output. */
export interface CliExposure {
  /** Space-separated command path, e.g. "server start". */
  command: string;
  aliases?: string[];
  description?: string;
  helpText?: string;
  arguments?: CliArgumentSpec[];
  options?: CliOptionSpec[];
  /** Exact operation ID, or false for help/version/lifecycle/admin reads. */
  journal?: string | false;
  parse?: (input: CliParseInput) => unknown;
  outcome?: (value: unknown) => JournalOutcome;
  errorOutcome?: (error: unknown) => JournalOutcome;
}

/** Explicit MCP exposure. Tool names and schemas are preserved verbatim. */
export interface ToolExposure<Input = Record<string, unknown>> {
  name: string;
  title?: string;
  description?: string;
  inputSchema: JsonSchema;
  outputSchema?: JsonSchema;
  annotations?: ToolAnnotations;
  execution?: { taskSupport?: TaskSupport };
  /** Validate/coerce raw MCP arguments. Throws on invalid input. */
  validate?: (raw: unknown) => Input;
}

export interface ActionDefinition<Input = unknown, Output = unknown> {
  /** Stable action id, unique inside one integration registry. */
  id: string;
  cli?: CliExposure;
  tool?: ToolExposure<Input>;
  handle(input: Input, context: ActionContext): Promise<Output>;
}

/** Optional structured result of a CLI handler. */
export interface CliActionOutcome {
  exitCode?: number;
  outcome?: JournalOutcome;
  metadata?: JournalMetadata;
}

export type CliHandlerResult = CliActionOutcome | ToolCallResult | number | void;
