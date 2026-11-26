import { z } from "zod";
import type { ActionDefinition, JsonSchema } from "@nones/mcp-core";
import { classify, OpenCodeClient } from "./client";
import { groupHistory } from "./history";
import {
  eventParams,
  historyParams,
  operationFilter,
  operationRequest,
  requestParams,
} from "./tool-schema";
import { toolFailure, toolResult } from "./tool-result";
import type { Operation } from "./types";

const streamOperations = ["event.subscribe", "experimental.session.log"];

interface HistoryInput {
  sessionID: string;
  cursor?: string;
  limit?: number;
}

export function jsonSchema(schema: z.ZodType): JsonSchema {
  const json = z.toJSONSchema(schema, {
    target: "draft-2020-12",
  }) as Record<string, unknown>;
  // The SDK's standard-schema conversion omits zod's synthetic top-level
  // `additionalProperties: false`; keep the published hash identical.
  if (json.additionalProperties === false) delete json.additionalProperties;
  return json as JsonSchema;
}

function validated<T>(schema: z.ZodType<T>) {
  return (raw: unknown): T => schema.parse(raw ?? {});
}

async function respond(run: () => MaybePromise<unknown>) {
  try {
    return toolResult(await run());
  } catch (error) {
    return toolFailure(error);
  }
}

function operationToolName(operation: Operation): string {
  return `opencode_${operation.id.replace(/[^a-zA-Z0-9_-]/g, "_")}`;
}

/**
 * Native OpenCode tool definitions. Handlers, schemas, annotations and result
 * shapes are unchanged; only protocol registration moved to core.
 */
export function toolActions(
  client: OpenCodeClient,
  operations: Operation[],
): ActionDefinition[] {
  const actions: ActionDefinition[] = [
    {
      id: "open_operations",
      tool: {
        name: "opencode_operations",
        description:
          "List supported safe-to-discover native OpenCode operations and their parameter metadata.",
        inputSchema: jsonSchema(operationFilter),
        annotations: { readOnlyHint: true, destructiveHint: false },
        validate: validated(operationFilter),
      },
      handle: async (input) =>
        respond(() =>
          operations
            .filter((op) => {
              const filter = (input as { filter?: string }).filter;
              return !filter || op.id.includes(filter);
            })
            .map((op) => ({ ...op, category: classify(op) })),
        ),
    },
    {
      id: "open_request",
      tool: {
        name: "opencode_request",
        description:
          "Call an operation by exact OpenAPI operation ID. The server centrally enforces safety gates.",
        inputSchema: jsonSchema(operationRequest),
        annotations: { readOnlyHint: false, destructiveHint: true },
        validate: validated(operationRequest),
      },
      handle: async (input, context) =>
        respond(() =>
          client.request(
            input as Parameters<OpenCodeClient["request"]>[0],
            context.signal,
          ),
        ),
    },
    {
      id: "open_history",
      tool: {
        name: "opencode_history",
        description:
          "Group a page of native messages by user prompt, including steering and assistant steps.",
        inputSchema: jsonSchema(historyParams),
        annotations: { readOnlyHint: true, destructiveHint: false },
        validate: validated(historyParams),
      },
      handle: async (input, context) =>
        respond(async () => {
          const history = input as HistoryInput;
          const page = await client.request(
            {
              operation: "session.message.list",
              path: { sessionID: history.sessionID },
              query: {
                ...(history.cursor ? { cursor: history.cursor } : { order: "asc" }),
                ...(history.limit ? { limit: history.limit } : {}),
              },
            },
            context.signal,
          );
          return groupHistory(page);
        }),
    },
    {
      id: "open_events",
      tool: {
        name: "opencode_events",
        description:
          "Read bounded native session log or volatile global events. Global stream has no replay cursor.",
        inputSchema: jsonSchema(eventParams),
        annotations: { readOnlyHint: true, destructiveHint: false },
        validate: validated(eventParams),
      },
      handle: async (input, context) =>
        respond(() =>
          client.events(
            input as Parameters<OpenCodeClient["events"]>[0],
            context.signal,
          ),
        ),
    },
  ];

  for (const operation of operations) {
    if (streamOperations.includes(operation.id)) continue;
    const category = classify(operation);
    actions.push({
      id: `open_${operation.id}`,
      tool: {
        name: operationToolName(operation),
        description: `${operation.description || operation.id} (native operation ${operation.id}). Path and query keys match the OpenAPI catalog.`,
        inputSchema: jsonSchema(requestParams),
        annotations: {
          readOnlyHint: category === "read",
          destructiveHint:
            category === "destructive" ||
            category === "admin" ||
            category === "exec",
        },
        validate: validated(requestParams),
      },
      handle: async (input, context) =>
        respond(() =>
          client.request(
            {
              ...(input as Record<string, unknown>),
              operation: operation.id,
            } as Parameters<OpenCodeClient["request"]>[0],
            context.signal,
          ),
        ),
    });
  }
  return actions;
}
