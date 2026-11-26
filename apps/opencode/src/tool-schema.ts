import { z } from "zod";

const pathSchema = z.record(z.string(), z.string()).optional();
const querySchema = z.record(z.string(), z.unknown()).optional();

export const requestParams = z.object({
  path: pathSchema,
  query: querySchema,
  body: z.unknown().optional(),
  confirm: z.boolean().optional(),
});

export const operationRequest = requestParams.extend({
  operation: z.string(),
});

export const operationFilter = z.object({ filter: z.string().optional() });

export const historyParams = z.object({
  sessionID: z.string(),
  cursor: z.string().optional(),
  limit: z.number().int().min(1).max(200).optional(),
});

export const eventParams = z.object({
  sessionID: z.string().optional(),
  source: z.enum(["live", "log"]).optional(),
  types: z.array(z.string()).optional(),
  after: z.number().int().min(0).optional(),
  limit: z.number().int().min(1).max(200).optional(),
  durationMs: z.number().int().min(100).max(30000).optional(),
});
