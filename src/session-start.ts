import { realpath, stat } from "node:fs/promises";
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
): Promise<StartedSession> {
  const prompt = await readPrompt(options.file);
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
  };
}

/** Create a session, steer the prompt, and print the admission JSON. */
export async function runStart(
  options: StartOptions,
  env: { [name: string]: string | undefined } = process.env,
): Promise<void> {
  const started = await startSessionPrompt(options, env);
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
}

/**
 * Submit directly to the owning service and session. No session is created
 * and nothing is awaited; the native admission receipt is printed.
 */
export async function runSend(
  options: SendOptions,
  env: { [name: string]: string | undefined } = process.env,
): Promise<void> {
  const delivery: Delivery = parseDelivery(options.delivery ?? "steer");
  const prompt = await readPrompt(options.file);
  const client = await OpenCodeClient.connect(env);
  let receipt;
  try {
    receipt = await submitPrompt(client, options.sessionID, prompt, delivery);
  } catch (error) {
    throw new Error(
      `Prompt submission failed for session ${options.sessionID}: ${
        error instanceof Error ? error.message : "unknown error"
      }`,
    );
  }
  console.log(
    formatJson({
      sessionID: options.sessionID,
      delivery,
      receipt,
    }),
  );
}
