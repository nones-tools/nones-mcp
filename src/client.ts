import { OperationCatalog } from "./catalog";
import { resolveConnection } from "./config";
import { EventStreams, type EventRequest } from "./events";
import { HttpTransport } from "./http";
import { buildRoute } from "./params";
import { WorkspaceScope } from "./scope";
import { authorize, classify } from "./security";
import type { Operation, Request } from "./types";

export { classify, sanitize } from "./security";
export type { Operation, Request } from "./types";

export class OpenCodeClient {
  private constructor(
    private transport: HttpTransport,
    private catalog: OperationCatalog,
    private scope: WorkspaceScope,
    private streams: EventStreams,
    private env: Environment,
  ) {}

  static async connect(
    env: { [name: string]: string | undefined } = process.env,
  ): Promise<OpenCodeClient> {
    const connection = await resolveConnection(env);
    const transport = new HttpTransport(
      connection.base,
      connection.headers,
      connection.timeout,
    );
    const scope = new WorkspaceScope(transport, connection.allowed);
    return new OpenCodeClient(
      transport,
      new OperationCatalog(transport),
      scope,
      new EventStreams(transport, scope),
      connection.env,
    );
  }

  async operations(signal?: AbortSignal): Promise<Operation[]> {
    return this.catalog.list(signal);
  }

  async request(input: Request, signal?: AbortSignal): Promise<any> {
    const op = (await this.operations(signal)).find(
      (operation) => operation.id === input.operation,
    );
    if (!op) throw new Error("Unsupported operation");
    if (op.id === "event.subscribe" || op.id === "experimental.session.log")
      throw new Error("Use the events tool for streams");
    authorize(classify(op), this.env, input.confirm);
    if (this.scope.enabled) await this.scope.assertRequest(op, input, signal);
    const route = buildRoute(op, input.path, input.query);
    const result = await this.transport.read(
      await this.transport.fetch(
        route,
        {
          method: op.method,
          ...(input.body !== undefined
            ? {
                headers: { "content-type": "application/json" },
                body: JSON.stringify(input.body),
              }
            : {}),
        },
        signal,
      ),
    );
    return this.scope.enabled ? this.scope.filterResult(op, result) : result;
  }

  async events(input: EventRequest, signal?: AbortSignal): Promise<any> {
    return this.streams.read(input, signal);
  }
}
