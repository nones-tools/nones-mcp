/**
 * The MCP tool surface over a DeepSeek Harness session controller.
 *
 * Every tool answers from `ctx.sessionController` in-process, as the owner, so
 * a prompt lands in the live conversation instead of opening a second writer on
 * the session log (which is what a `dsh --profile sdk`/`acp` resume of a live
 * session would collide with).
 *
 * Protocol registration and durable journaling live in `@nones/mcp-core`: the
 * action registry keeps tool names, titles and schemas frozen, and the core
 * `createToolServer` journals exactly one record per call through the shared
 * journal sink. The bounded observer in this module only feeds the Settings
 * page's "last five requests" card; it is never the durable journal.
 *
 * @module dsh-session-mcp/tools
 */
import { randomUUID } from 'node:crypto'
import {
  createActionRegistry,
  registryTools,
  type ActionDefinition,
  type JsonSchema,
  type ToolServerEntry,
} from '@nones/mcp-core'
import type { CallToolResult } from '@modelcontextprotocol/server'
import { z } from 'zod'
import type { RequestJournal } from './log.js'
import type { SessionController, SessionEventRecord } from './types.js'

/** Longest single message body returned to a client. */
const MAX_TEXT_CHARS = 4000

/** One reduced conversational message. */
interface ReducedMessage {
  seq?: number
  type?: string
  time?: number
  role?: string
  name?: string
  text: string
}

/** A signal that never aborts; the controller only needs a cancellation handle. */
function never(): AbortSignal {
  return new AbortController().signal
}

/** Collapse one content-block array into readable text. */
function blocksToText(blocks: unknown): string {
  if (typeof blocks === 'string') return blocks
  if (!Array.isArray(blocks)) return ''
  const parts: string[] = []
  for (const block of blocks) {
    if (block === null || typeof block !== 'object') continue
    const candidate = block as { type?: string; text?: unknown; name?: unknown; arguments?: unknown }
    if (candidate.type === 'text' && typeof candidate.text === 'string') parts.push(candidate.text)
    else if (candidate.type === 'tool-call') {
      parts.push(`[tool ${String(candidate.name ?? '?')} ${String(candidate.arguments ?? '').slice(0, 400)}]`)
    } else if (candidate.type === 'image') parts.push('[image]')
  }
  return parts.join('\n').trim()
}

/**
 * Reduce one durable Session event to a compact message.
 * @param record - one entry of `sessionController.page().records`.
 * @returns a message, or `null` for events without conversational content.
 */
function reduceRecord(record: SessionEventRecord): ReducedMessage | null {
  const event = (record.event ?? record) as {
    type?: string
    seq?: number
    time?: number
    data?: Record<string, unknown>
  }
  if (event === null || typeof event !== 'object') return null
  const data = (event.data ?? {}) as Record<string, unknown>
  const message = (data.message ?? {}) as { role?: string; content?: unknown }
  const out: ReducedMessage = { seq: event.seq, type: event.type, text: '' }
  if (event.time !== undefined) out.time = event.time

  if (event.type === 'user/message' || event.type === 'assistant/message') {
    out.role = message.role ?? (event.type === 'user/message' ? 'user' : 'assistant')
    out.text = blocksToText(message.content)
  } else if (event.type === 'tool/call') {
    out.role = 'tool'
    out.name = typeof data.name === 'string' ? data.name : undefined
    out.text = String(data.arguments ?? '')
  } else if (event.type === 'tool/result') {
    out.role = 'tool'
    out.text = blocksToText(message.content)
  } else {
    return null
  }

  if (out.text.length > MAX_TEXT_CHARS) out.text = `${out.text.slice(0, MAX_TEXT_CHARS)}… [truncated]`
  return out
}

/** Wrap one value as an MCP text result. */
function ok(value: unknown): CallToolResult {
  return { content: [{ type: 'text', text: JSON.stringify(value, null, 2) }] }
}

/** Wrap one failure as an MCP error result. */
function fail(error: unknown): CallToolResult {
  const message = error instanceof Error ? error.message : String(error)
  return { content: [{ type: 'text', text: message }], isError: true }
}

/** First text block of a result, for the Settings failure line. */
function firstText(result: CallToolResult): string {
  const block = result.content?.[0] as { text?: unknown } | undefined
  return typeof block?.text === 'string' ? block.text.slice(0, 400) : 'the tool reported an error'
}

/** Read the created conversation id out of a `session_create` result. */
function createdSessionId(result: CallToolResult): string | null {
  try {
    const raw = (result.content?.[0] as { text?: unknown } | undefined)?.text
    const parsed: unknown = JSON.parse(typeof raw === 'string' ? raw : '')
    if (parsed !== null && typeof parsed === 'object') {
      const id = (parsed as { sessionId?: unknown }).sessionId
      if (typeof id === 'string') return id
    }
  } catch {
    /* A malformed result is already the caller's error. */
  }
  return null
}

/** The Standard Schema JSON-bearing surface Zod 4 exposes to the MCP SDK. */
interface StandardJsonSchema {
  readonly jsonSchema: {
    input(options: { target: 'draft-2020-12' }): unknown
  }
}

/**
 * Convert one Zod object schema exactly the way the MCP SDK does.
 * @param schema - tool input schema.
 * @returns JSON Schema for `tools/list`, frozen for this tool version.
 */
function jsonSchemaOf(schema: z.ZodType): JsonSchema {
  const standard = (schema as unknown as { '~standard'?: StandardJsonSchema })['~standard']
  if (standard?.jsonSchema?.input !== undefined) {
    return standard.jsonSchema.input({ target: 'draft-2020-12' }) as JsonSchema
  }
  return z.toJSONSchema(schema, { target: 'draft-2020-12', io: 'input' }) as JsonSchema
}

/** One frozen tool definition and its in-process implementation. */
interface ToolSpec<Schema extends z.ZodType> {
  readonly name: string
  readonly title: string
  readonly description: string
  readonly schema: Schema
  /** Whether the addressed conversation comes from the result instead of the input. */
  readonly fromResult?: boolean
  run(
    input: z.infer<Schema>,
    context: { readonly signal?: AbortSignal | undefined },
  ): Promise<CallToolResult>
}

/**
 * Build one registry action while keeping the wire schema and the Settings
 * observer attached to the same handler.
 * @param spec - name, metadata, Zod schema and handler.
 * @returns a core action definition exposing exactly one MCP tool.
 */
function defineTool<Schema extends z.ZodType>(
  spec: ToolSpec<Schema>,
  observer: RequestJournal | undefined,
): ActionDefinition<z.infer<Schema>> {
  return {
    id: spec.name,
    tool: {
      name: spec.name,
      title: spec.title,
      description: spec.description,
      inputSchema: jsonSchemaOf(spec.schema),
      validate: (raw) => spec.schema.parse(raw ?? {}),
    },
    async handle(input, context) {
      const started = Date.now()
      let result: CallToolResult
      try {
        result = await spec.run(input, context)
      } catch (error) {
        result = fail(error)
      }
      if (observer !== undefined) {
        const failed = result.isError === true
        const addressed =
          typeof (input as { sessionId?: unknown }).sessionId === 'string'
            ? (input as { sessionId: string }).sessionId
            : spec.fromResult === true
              ? createdSessionId(result)
              : null
        observer.record({
          tool: spec.name,
          at: new Date().toISOString(),
          sessionId: addressed,
          ok: !failed,
          ms: Date.now() - started,
          ...(failed ? { error: firstText(result) } : {}),
        })
      }
      return result
    },
  }
}

/**
 * Build the frozen tool entries for one Harness session controller.
 *
 * @param controller - the Harness `sessionController` service.
 * @param observer - bounded observer the Settings page reads.
 * @returns entries ready for the shared core `createToolServer`.
 */
export function dshToolEntries(
  controller: SessionController,
  observer?: RequestJournal,
): ToolServerEntry[] {
  const actions: ActionDefinition[] = []
  const add = <Schema extends z.ZodType>(spec: ToolSpec<Schema>): void => {
    actions.push(defineTool(spec, observer))
  }

  add({
    name: 'sessions_list',
    title: 'List conversations',
    description:
      'List DeepSeek Harness conversations with id, title, working directory, running state and token usage. Call this first to discover the sessionId to read or prompt.',
    schema: z.object({
      limit: z.number().int().min(1).max(500).optional().describe('Maximum rows, newest first. Default 50.'),
    }),
    async run({ limit }, context) {
      const value = await controller.list({}, context.signal ?? never())
      const rows = [...(value?.items ?? [])]
        .sort((a, b) => (b.updatedAt ?? 0) - (a.updatedAt ?? 0))
        .slice(0, limit ?? 50)
        .map((item) => ({
          sessionId: item.sessionId,
          title: item.projections?.values?.title ?? null,
          cwd: item.cwd ?? null,
          updatedAt: item.updatedAt === undefined ? null : new Date(item.updatedAt).toISOString(),
          running: item.running === true,
          blank: item.blank === true,
          agentAvailable: item.agentAvailable === true,
          tokens: item.projections?.values?.tokenUsage ?? null,
        }))
      return ok({ count: rows.length, sessions: rows })
    },
  })

  add({
    name: 'session_read',
    title: 'Read conversation history',
    description:
      'Read durable history of one conversation (user, assistant and tool messages). Use beforeSeq to page further back.',
    schema: z.object({
      sessionId: z.string().min(1).describe('Conversation id from sessions_list.'),
      maxMessages: z.number().int().min(1).max(200).optional().describe('Roughly how many messages. Default 20.'),
      beforeSeq: z.number().int().min(0).optional().describe('Only return events before this sequence number.'),
    }),
    async run({ sessionId, maxMessages, beforeSeq }, context) {
      const signal = context.signal ?? never()
      const rows = await controller.list({}, signal)
      const cut = (rows?.items ?? []).find((item) => item.sessionId === sessionId)?.projections?.asOfSeq
      const projections = typeof cut === 'number' ? undefined : await controller.projections({ sessionId }, signal)
      const throughSeq = typeof cut === 'number' ? cut : projections?.asOfSeq
      if (typeof throughSeq !== 'number') throw new Error(`Session ${sessionId} has no readable log cut`)

      const request: Record<string, unknown> = {
        address: { kind: 'session', sessionId },
        throughSeq,
        maxMessages: maxMessages ?? 20,
      }
      if (beforeSeq !== undefined) request.beforeSeq = beforeSeq

      const page = await controller.page(request, signal)
      const messages = (page?.records ?? []).map(reduceRecord).filter((entry) => entry !== null)
      return ok({ sessionId, throughSeq, hasMore: page?.hasMore === true, messages })
    },
  })

  add({
    name: 'session_send',
    title: 'Send a message into a conversation',
    description:
      'Send a user message into an existing conversation. The message joins the live chat a human sees and starts a model turn. mode=queue waits for the current turn, mode=steer interrupts into it.',
    schema: z.object({
      sessionId: z.string().min(1).describe('Conversation id from sessions_list.'),
      text: z.string().min(1).describe('Message text to deliver.'),
      mode: z.enum(['queue', 'steer']).optional().describe('Delivery mode. Default queue.'),
    }),
    async run({ sessionId, text, mode }, context) {
      if (text.trim().length === 0) throw new Error('text must contain non-whitespace content')
      const requestId = randomUUID()
      const delivery = mode ?? 'queue'
      const value = await controller.prompt(
        { requestId, sessionId, mode: delivery, content: [{ type: 'text', text }] },
        context.signal ?? never(),
      )
      return ok({ sessionId, requestId, mode: delivery, accepted: value?.accepted === true })
    },
  })

  add({
    name: 'session_create',
    title: 'Open a new conversation',
    description:
      'Open a new blank conversation in the Harness and return its id. Combine with session_send to start work in a fresh chat.',
    schema: z.object({
      cwd: z.string().min(1).optional().describe('Absolute directory the conversation works in.'),
      agentPreset: z.string().min(1).optional().describe('Agent preset name. Omit for the configured default.'),
    }),
    fromResult: true,
    async run({ cwd, agentPreset }) {
      const request: Record<string, unknown> = {}
      if (cwd !== undefined) request.cwd = cwd
      if (agentPreset !== undefined) request.agentPreset = agentPreset
      const value = await controller.create(request)
      return ok({ sessionId: value?.sessionId ?? null, agentPreset: value?.agentPreset ?? null })
    },
  })

  add({
    name: 'session_search',
    title: 'Search conversations',
    description:
      'Full-text search across conversations. Works only when the Harness has the session-query index enabled; otherwise the Host reports that search is disabled.',
    schema: z.object({
      query: z.string().min(1).describe('Search text.'),
    }),
    async run({ query }, context) {
      const value = await controller.search({ query }, context.signal ?? never())
      return ok({ items: value?.items ?? [], hasMore: value?.hasMore === true })
    },
  })

  add({
    name: 'session_inspect',
    title: 'Inspect one conversation',
    description:
      'Vitals of one conversation: title, run state, token usage, context pressure, pending queue, selected model and goal. Cheaper than reading history when you only need its state.',
    schema: z.object({
      sessionId: z.string().min(1).describe('Conversation id from sessions_list.'),
    }),
    async run({ sessionId }, context) {
      const signal = context.signal ?? never()
      const rows = await controller.list({}, signal)
      const row = (rows?.items ?? []).find((item) => item.sessionId === sessionId)
      const projections = await controller.projections({ sessionId }, signal)
      if (projections === null) throw new Error(`Session ${sessionId} not found`)
      const values = (projections.values ?? {}) as Record<string, unknown>
      return ok({
        sessionId,
        title: values.title ?? null,
        running: row?.running === true,
        agentAvailable: row?.agentAvailable === true,
        cwd: row?.cwd ?? null,
        tokens: values.tokenUsage ?? null,
        contextPressure: values.contextPressure ?? null,
        contextBreakdown: values.contextBreakdown ?? null,
        sessionStats: values.sessionStats ?? null,
        inbox: values.inbox ?? null,
        model: values.modelSelection ?? null,
        goal: values.goal ?? null,
      })
    },
  })

  add({
    name: 'session_rename',
    title: 'Rename a conversation',
    description:
      'Set the title of one conversation. Returns the normalized title and the event position that committed it.',
    schema: z.object({
      sessionId: z.string().min(1).describe('Conversation id from sessions_list.'),
      title: z.string().min(1).max(200).describe('New title.'),
    }),
    async run({ sessionId, title }) {
      const value = await controller.rename({ sessionId, title })
      return ok({ sessionId, title: value?.title ?? title, seq: value?.seq ?? null })
    },
  })

  add({
    name: 'session_fork',
    title: 'Fork a conversation',
    description:
      'Copy a conversation prefix into a new conversation and return its id. Omit atSeq to fork at the latest completed turn — useful to branch off an alternative approach without disturbing the original.',
    schema: z.object({
      sessionId: z.string().min(1).describe('Conversation id from sessions_list.'),
      atSeq: z.number().int().min(0).optional().describe('Exact inclusive source event seq to cut at.'),
    }),
    async run({ sessionId, atSeq }) {
      const request: Record<string, unknown> = { sessionId }
      if (atSeq !== undefined) request.atSeq = atSeq
      const value = await controller.fork(request as { sessionId: string })
      return ok({ sourceSessionId: sessionId, sessionId: value?.sessionId ?? null })
    },
  })

  add({
    name: 'session_cancel',
    title: 'Stop a running turn',
    description:
      'Ask the Host to cancel the turn a conversation is currently running. Pending inbox work is retained, so a queued message is not lost.',
    schema: z.object({
      sessionId: z.string().min(1).describe('Conversation id from sessions_list.'),
    }),
    async run({ sessionId }) {
      const value = controller.cancel({ sessionId })
      return ok({ sessionId, accepted: value?.accepted === true })
    },
  })

  add({
    name: 'models_list',
    title: 'List available models',
    description:
      'Every model route this harness can currently reach, grouped by provider, with the reasoning efforts each accepts and the deployment default. Call before session_select_model.',
    schema: z.object({}),
    async run() {
      const catalog = await controller.modelCatalog()
      return ok({
        default: catalog?.default ?? null,
        providers: (catalog?.groups ?? []).map((group) => ({
          id: group.id,
          name: group.name,
          models: (group.models ?? []).map((model) => ({
            id: model.id,
            name: model.name,
            description: model.description ?? null,
            reasoningEfforts: (model.reasoning?.efforts ?? []).map((effort) => effort.id),
            defaultReasoningEffort: model.reasoning?.defaultEffort ?? null,
          })),
        })),
        unavailable: (catalog?.failures ?? []).map((failure) => ({
          provider: failure.id,
          message: failure.message,
        })),
      })
    },
  })

  add({
    name: 'session_select_model',
    title: 'Choose the model for a conversation',
    description:
      'Pin one provider/model route (and optional reasoning effort) to a conversation. Use models_list first: an unavailable pair is rejected with session/model-unavailable.',
    schema: z.object({
      sessionId: z.string().min(1).describe('Conversation id from sessions_list.'),
      provider: z.string().min(1).describe('Provider id from models_list.'),
      model: z.string().min(1).describe('Model id from models_list.'),
      reasoningEffort: z.string().min(1).optional().describe('Reasoning effort id the route accepts.'),
    }),
    async run({ sessionId, provider, model, reasoningEffort }) {
      const request: Record<string, unknown> = { sessionId, provider, model }
      if (reasoningEffort !== undefined) request.reasoningEffort = reasoningEffort
      const value = await controller.selectModel(request as { sessionId: string; provider: string; model: string })
      return ok({ sessionId, selected: value?.selected ?? null })
    },
  })

  const registry = createActionRegistry('dsh-session-mcp', actions)
  return registryTools(registry)
}
