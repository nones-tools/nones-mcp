import {
  attachJournalMetadata,
  type CliActionOutcome,
} from "@nones/mcp-core";
import { observeSession } from "./monitor-cli";
import { readPrompt } from "./prompt";
import { startSessionPrompt, type StartedSession } from "./session-start";
import { errorSessionID } from "./journal-cli";

export interface RunOptions {
  directory: string;
  file: string;
  model?: string;
  title?: string;
  timeoutSeconds?: number;
}

/**
 * Compose start and until-turn monitoring. The created session metadata is
 * the observation baseline before the prompt is delivered, so a turn that
 * finishes before the first stream read is still reconciled from time.idle.
 */
export async function runRun(
  options: RunOptions,
  env: { [name: string]: string | undefined } = process.env,
): Promise<CliActionOutcome> {
  const deadline = options.timeoutSeconds
    ? Date.now() + options.timeoutSeconds * 1000
    : undefined;
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
  process.stdout.write(
    `${JSON.stringify({
      event: "started",
      sessionID: started.info.id,
      directory: started.directory,
      model: started.model,
      modelSource: started.modelSource,
      title: started.info.title ?? options.title ?? null,
      receipt: started.receipt,
    })}\n`,
  );
  const metadata = {
    prompt,
    sessionId: started.info.id,
    sessionTitle: started.info.title ?? options.title,
    messageId: started.receipt.id,
  };
  let code: number;
  try {
    code = (
      await observeSession(started.client, {
        sessionID: started.info.id,
        untilTurn: true,
        baseline: started.info,
        deadline,
      })
    ).code;
  } catch (error) {
    throw attachJournalMetadata(error, metadata);
  }
  return { exitCode: code, metadata };
}
