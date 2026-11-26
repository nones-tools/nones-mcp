import {
  JournalSink,
  cliOperation,
  journalInvocation,
  outcomeFromExitCode,
  type JournalMetadata,
  type JournalOutcome,
} from "../journal/index";
import type { ActionDefinition, CliExposure } from "./types";

export interface CliSurfaceOptions {
  /** Trusted injected sink; omit to resolve config lazily on the first record. */
  journal?: JournalSink | null;
  env?: Record<string, string | undefined>;
  cwd?: string;
  recordTimeoutMs?: number;
  setExitCode?: (code: number) => void;
  onUnknown?: (command: string | undefined) => number | void;
  onError?: (error: unknown, action: ActionDefinition) => number | void;
}

export interface DispatcherContext {
  integration: string;
  sink: JournalSink | null;
  options: CliSurfaceOptions;
}

export interface CliClassification {
  exitCode?: number;
  outcome?: JournalOutcome;
  metadata?: JournalMetadata;
}

export function classify(value: unknown): CliClassification {
  if (typeof value === "number")
    return { exitCode: value, outcome: outcomeFromExitCode(value) };
  if (typeof value !== "object" || value === null) return {};
  const candidate = value as {
    exitCode?: unknown;
    outcome?: unknown;
    metadata?: unknown;
  };
  const result: CliClassification = {};
  if (typeof candidate.exitCode === "number") {
    result.exitCode = candidate.exitCode;
    result.outcome = outcomeFromExitCode(candidate.exitCode);
  }
  if (
    candidate.outcome === "success" ||
    candidate.outcome === "failure" ||
    candidate.outcome === "cancelled"
  )
    result.outcome = candidate.outcome;
  if (typeof candidate.metadata === "object" && candidate.metadata !== null)
    result.metadata = candidate.metadata as JournalMetadata;
  return result;
}

function operationFor(integration: string, exposure: CliExposure): string | null {
  if (exposure.journal === false) return null;
  if (typeof exposure.journal === "string") return exposure.journal;
  return cliOperation(integration, exposure.command);
}

export function defaultExit(code: number): void {
  process.exitCode = code;
}

function defaultError(error: unknown, options: CliSurfaceOptions): void {
  (options.setExitCode ?? defaultExit)(1);
  console.error(error instanceof Error ? error.message : "Command failed");
}

export async function dispatch(
  context: DispatcherContext,
  action: ActionDefinition,
  input: unknown,
): Promise<void> {
  const exposure = action.cli;
  if (!exposure) throw new Error(`action ${action.id} has no CLI exposure`);
  const operation = operationFor(context.integration, exposure);
  const sink = operation === null ? null : context.sink;
  try {
    const value = await journalInvocation(
      {
        sink,
        operation: operation ?? cliOperation(context.integration, exposure.command),
        ...(exposure.errorOutcome === undefined
          ? {}
          : { errorOutcome: exposure.errorOutcome }),
        resultMetadata: (result) => classify(result).metadata,
        outcome: (result) =>
          classify(result).outcome ??
          (exposure.outcome ? exposure.outcome(result) : "success"),
      },
      () => action.handle(input, { surface: "cli" }),
    );
    const exitCode = classify(value).exitCode;
    if (exitCode !== undefined) (context.options.setExitCode ?? defaultExit)(exitCode);
  } catch (error) {
    if (context.options.onError) context.options.onError(error, action);
    else defaultError(error, context.options);
  }
}

export function sinkFor(options: CliSurfaceOptions): {
  sink: JournalSink;
  owned: boolean;
} {
  if (options.journal !== undefined) {
    if (options.journal === null) return { sink: JournalSink.disabled(), owned: false };
    return { sink: options.journal, owned: false };
  }
  return {
    sink: new JournalSink({
      ...(options.env === undefined ? {} : { env: options.env }),
      ...(options.cwd === undefined ? {} : { cwd: options.cwd }),
      ...(options.recordTimeoutMs === undefined
        ? {}
        : { recordTimeoutMs: options.recordTimeoutMs }),
    }),
    owned: true,
  };
}
