import { observeSession } from "./monitor-cli";
import { startSessionPrompt } from "./session-start";

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
  const started = await startSessionPrompt(options, env);
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
  const result = await observeSession(started.client, {
    sessionID: started.info.id,
    untilTurn: true,
    baseline: started.info,
    deadline,
  });
  return result.code;
}
