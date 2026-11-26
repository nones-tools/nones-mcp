import { observeSession } from "./monitor-cli";
import { readPrompt } from "./prompt";
import { startSessionPrompt, type StartedSession } from "./session-start";
import { recordJournaledOperation } from "./journal/cli-action";
import { errorSessionID, monitorOutcome } from "./journal-cli";

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
): Promise<number> {
  const deadline = options.timeoutSeconds
    ? Date.now() + options.timeoutSeconds * 1000
    : undefined;
  const prompt = await readPrompt(options.file);
  const startedAt = Date.now();
  let started: StartedSession;
  try {
    started = await startSessionPrompt(options, env, prompt);
  } catch (error) {
    await recordJournaledOperation({
      operation: "opencode.session.run",
      prompt,
      sessionId: errorSessionID(error),
      outcome: "failure",
      startedAt,
      endedAt: Date.now(),
      env,
    });
    throw error;
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
    await recordJournaledOperation({
      operation: "opencode.session.run",
      prompt,
      sessionId: started.info.id,
      sessionTitle: started.info.title ?? options.title,
      messageId: started.receipt.id,
      outcome: "failure",
      startedAt,
      endedAt: Date.now(),
      env,
    });
    throw error;
  }
  await recordJournaledOperation({
    operation: "opencode.session.run",
    prompt,
    sessionId: started.info.id,
    sessionTitle: started.info.title ?? options.title,
    messageId: started.receipt.id,
    outcome: monitorOutcome(code),
    startedAt,
    endedAt: Date.now(),
    env,
  });
  return code;
}
