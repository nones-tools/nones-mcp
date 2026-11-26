import { realpath, stat } from "node:fs/promises";
import {
  attachJournalMetadata,
  type CliActionOutcome,
  type JournalMetadata,
} from "@nones/mcp-core";
import { OpenCodeClient } from "./client";
import { formatJson } from "./json";
import {
  createSession,
  parseDelivery,
  sessionFailure,
  submitPrompt,
  type Delivery,
  type SessionInfo,
  type SessionReceipt,
} from "./native-session";
import { readPrompt } from "./prompt";
import { resolveModel, type ModelRef } from "./session-model";
import {
  bestEffortSessionTitle,
  errorSessionID,
  journalingEnabled,
} from "./journal-cli";

export interface StartOptions {
  directory: string;
  file: string;
  model?: string;
  title?: string;
}

export interface SendOptions {
  sessionID: string;
  file: string;
  delivery?: string;
}

export interface StartedSession {
  client: OpenCodeClient;
  directory: string;
  model: ModelRef;
  modelSource: string;
  info: SessionInfo;
  receipt: SessionReceipt;
  /** Authorized prompt text, kept for CLI-only journaling. */
  prompt: string;
}

/** Resolve and verify the working directory before any native mutation. */
export async function resolveDirectory(input: string): Promise<string> {
  if (!input) throw new Error("Working directory is required");
  let resolved: string;
  try {
    resolved = await realpath(input);
  } catch {
    throw new Error(`Working directory not found: ${input}`);
  }
  const info = await stat(resolved);
  if (!info.isDirectory())
    throw new Error(`Working directory is not a directory: ${input}`);
  return resolved;
}

/**
 * Validate the prompt, directory, and model, create the native session, and
 * deliver the prompt with steer. Shared by `start` and `run`.
 */
export async function startSessionPrompt(
  options: StartOptions,
  env: { [name: string]: string | undefined } = process.env,
  promptText?: string,
): Promise<StartedSession> {
  const prompt = promptText ?? (await readPrompt(options.file));
  const directory = await resolveDirectory(options.directory);
  const client = await OpenCodeClient.connect(env);
  const resolved = await resolveModel(client, directory, env, options.model);
  const info = await createSession(
    client,
    directory,
    resolved.model,
    options.title,
  );
  let receipt: SessionReceipt;
  try {
    receipt = await submitPrompt(client, info.id, prompt, "steer");
  } catch (error) {
    throw sessionFailure(info.id, error);
  }
  return {
    client,
    directory,
    model: resolved.model,
    modelSource: resolved.source,
    info,
    receipt,
    prompt,
  };
}

/** Create a session, steer the prompt, and print the admission JSON. */
export async function runStart(
  options: StartOptions,
  env: { [name: string]: string | undefined } = process.env,
): Promise<CliActionOutcome> {
  const prompt = await readPrompt(options.file);
  let started: StartedSession;
  try {
    started = await startSessionPrompt(options, env, prompt);
  } catch (error) {
    throw attachJournalMetadata(error, {
      prompt,
      sessionId: errorSessionID(error),
    });
  }
  console.log(
    formatJson({
      sessionID: started.info.id,
      directory: started.directory,
      model: started.model,
      modelSource: started.modelSource,
      title: started.info.title ?? options.title ?? null,
      receipt: started.receipt,
    }),
  );
  return {
    metadata: {
      prompt: started.prompt,
      sessionId: started.info.id,
      sessionTitle: started.info.title ?? options.title,
      messageId: started.receipt.id,
    },
  };
}

/**
 * Submit directly to the owning service and session. No session is created
 * and nothing is awaited; the native admission receipt is printed.
 */
export async function runSend(
  options: SendOptions,
  env: { [name: string]: string | undefined } = process.env,
): Promise<CliActionOutcome> {
  const delivery: Delivery = parseDelivery(options.delivery ?? "steer");
  const prompt = await readPrompt(options.file);
  const client = await OpenCodeClient.connect(env);
  let receipt: SessionReceipt;
  try {
    receipt = await submitPrompt(client, options.sessionID, prompt, delivery);
  } catch (error) {
    const metadata: JournalMetadata = {
      prompt,
      sessionId: options.sessionID,
    };
    throw attachJournalMetadata(
      new Error(
        `Prompt submission failed for session ${options.sessionID}: ${
          error instanceof Error ? error.message : "unknown error"
        }`,
      ),
      metadata,
    );
  }
  console.log(
    formatJson({
      sessionID: options.sessionID,
      delivery,
      receipt,
    }),
  );
  const title = (await journalingEnabled(env))
    ? await bestEffortSessionTitle(client, options.sessionID)
    : undefined;
  return {
    metadata: {
      prompt,
      sessionId: options.sessionID,
      ...(title === undefined ? {} : { sessionTitle: title }),
      messageId: receipt.id,
    },
  };
}
