#!/usr/bin/env node
/**
 * Smoke test: start the endpoint against a stub session controller and drive it
 * with the real MCP client.
 *
 * No harness is required. This is the check a contributor runs before opening a
 * pull request: it proves the bearer gate, the tool surface, the wire contract
 * of every tool, and the bounded journal.
 *
 *   bun run test
 *
 * @module dsh-session-mcp/test
 */
import { Client, StreamableHTTPClientTransport } from '@modelcontextprotocol/client'
import { journalSinkFor } from '@nones/mcp-core'
import { openSqliteJournal } from '@nones/journal/sqlite'
import { mkdtempSync, readFileSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { createToken } from '../dist/config.js'
import { RequestJournal } from '../dist/log.js'
import { startEndpoint } from '../dist/server.js'

/** Tools this server must expose. Keep in sync with `src/tools.ts`. */
const EXPECTED_TOOLS = [
  'models_list',
  'session_cancel',
  'session_create',
  'session_fork',
  'session_inspect',
  'session_read',
  'session_rename',
  'session_search',
  'session_select_model',
  'session_send',
  'sessions_list',
]

/** The frozen 1.4.0 wire surface copied from the public release. */
const BASELINE_TOOLS = JSON.parse(
  readFileSync(new URL('./fixtures/tools.baseline.json', import.meta.url), 'utf8'),
)

/** Compare JSON values without depending on object key order. */
function canonical(value) {
  if (Array.isArray(value)) return value.map(canonical)
  if (value === null || typeof value !== 'object') return value
  return Object.fromEntries(
    Object.keys(value)
      .sort()
      .map((key) => [key, canonical(value[key])]),
  )
}

const NOW = Date.now()

/** A controller that answers every call without touching a real harness. */
const controller = {
  async list() {
    return {
      items: [
        {
          sessionId: 'session-demo',
          updatedAt: NOW,
          cwd: '/tmp',
          running: true,
          blank: false,
          agentAvailable: true,
          projections: { asOfSeq: 12, values: { title: 'Demo chat', tokenUsage: { outputTokens: 5 } } },
        },
      ],
    }
  },
  async page() {
    return {
      hasMore: true,
      records: [
        {
          type: 'event',
          event: {
            type: 'user/message',
            seq: 1,
            time: NOW,
            data: { message: { role: 'user', content: [{ type: 'text', text: 'hello there' }] } },
          },
        },
        { type: 'event', event: { type: 'step/start', seq: 2, data: {} } },
      ],
    }
  },
  async prompt() {
    return { accepted: true }
  },
  async create() {
    return { sessionId: 'session-created', agentPreset: 'default' }
  },
  async search() {
    return { items: [], hasMore: false }
  },
  async projections() {
    return { kind: 'sequenced', asOfSeq: 12, values: { title: 'Demo chat', tokenUsage: { outputTokens: 5 } } }
  },
  async rename(request) {
    return { title: request.title, seq: 13 }
  },
  async fork() {
    return { sessionId: 'session-forked' }
  },
  cancel() {
    return { accepted: true }
  },
  async modelCatalog() {
    return {
      default: { provider: 'demo', model: 'demo-1' },
      routableProviders: ['demo'],
      groups: [{ id: 'demo', name: 'Demo', models: [{ id: 'demo-1', name: 'Demo One' }] }],
      failures: [],
    }
  },
  async selectModel(request) {
    return { selected: { provider: request.provider, model: request.model } }
  },
}

const failures = []

/** Record one assertion. */
function check(label, condition, detail = '') {
  if (condition) {
    console.log(`  ok   ${label}`)
    return
  }
  failures.push(`${label}${detail === '' ? '' : ` — ${detail}`}`)
  console.log(`  FAIL ${label}${detail === '' ? '' : ` — ${detail}`}`)
}

// The listener reads the token per request, so rotation takes effect live.
let token = createToken()
const journal = new RequestJournal()
const journalDir = mkdtempSync(join(tmpdir(), 'dsh-session-mcp-journal-'))
const adapter = await openSqliteJournal(join(journalDir, 'journal.sqlite'))
const sink = journalSinkFor({ adapter })
const endpoint = await startEndpoint({
  controller,
  token: () => token,
  host: '127.0.0.1',
  port: 0,
  version: 'test',
  journal,
  sink,
})

try {
  console.log('auth')
  const anonymous = await fetch(endpoint.url, {
    method: 'POST',
    headers: { 'content-type': 'application/json', accept: 'application/json, text/event-stream' },
    body: JSON.stringify({ jsonrpc: '2.0', id: 1, method: 'tools/list' }),
  })
  check('401 without a bearer', anonymous.status === 401, `got ${String(anonymous.status)}`)

  const wrong = await fetch(endpoint.url, {
    method: 'POST',
    headers: {
      'content-type': 'application/json',
      accept: 'application/json, text/event-stream',
      authorization: 'Bearer not-the-token',
    },
    body: JSON.stringify({ jsonrpc: '2.0', id: 1, method: 'tools/list' }),
  })
  check('401 with a wrong bearer', wrong.status === 401, `got ${String(wrong.status)}`)

  const client = new Client({ name: 'smoke', version: '0' }, { capabilities: {} })
  await client.connect(
    new StreamableHTTPClientTransport(new URL(endpoint.url), {
      requestInit: { headers: { Authorization: `Bearer ${token}` } },
    }),
  )

  console.log('surface')
  const listed = await client.listTools()
  const names = listed.tools.map((tool) => tool.name).sort()
  check('every expected tool is exposed', JSON.stringify(names) === JSON.stringify(EXPECTED_TOOLS), names.join(', '))
  check(
    'the 1.4.0 names, schemas, titles and descriptions are unchanged',
    JSON.stringify(canonical(listed.tools)) === JSON.stringify(canonical(BASELINE_TOOLS)),
  )

  console.log('tools')
  const calls = [
    ['sessions_list', { limit: 5 }],
    ['session_read', { sessionId: 'session-demo', maxMessages: 5 }],
    ['session_inspect', { sessionId: 'session-demo' }],
    ['session_send', { sessionId: 'session-demo', text: 'ping' }],
    ['session_create', { cwd: '/tmp' }],
    ['session_rename', { sessionId: 'session-demo', title: 'Renamed' }],
    ['session_fork', { sessionId: 'session-demo' }],
    ['session_cancel', { sessionId: 'session-demo' }],
    ['session_search', { query: 'x' }],
    ['models_list', {}],
    ['session_select_model', { sessionId: 'session-demo', provider: 'demo', model: 'demo-1' }],
  ]
  for (const [name, args] of calls) {
    const result = await client.callTool({ name, arguments: args })
    check(`${name} answers`, result.isError !== true, String(result.content?.[0]?.text ?? '').slice(0, 120))
  }

  const rejected = await client.callTool({ name: 'session_send', arguments: { sessionId: 'session-demo', text: '   ' } })
  check('blank text is rejected', rejected.isError === true)

  console.log('journal')
  check('every call is counted', journal.totalCalls === calls.length + 1, `got ${String(journal.totalCalls)}`)
  check('only the newest five are kept', journal.snapshot().length === 5, `got ${String(journal.snapshot().length)}`)
  check('the newest entry is first', journal.snapshot()[0]?.tool === 'session_send')
  check('the addressed conversation is recorded', journal.snapshot()[0]?.sessionId === 'session-demo')
  check('the failure is remembered', journal.lastFailure?.tool === 'session_send')

  console.log('core journal')
  const page = await adapter.query({ limit: 50 })
  const operations = page.records.map((entry) => entry.operation)
  check('core journal persists every handled call', page.records.length === calls.length + 1, `got ${String(page.records.length)}`)
  check(
    'core journal uses the shared dsh operation ids',
    operations.includes('dsh-session-mcp.mcp.sessions_list') &&
      operations.includes('dsh-session-mcp.mcp.session_send'),
    operations.slice(0, 4).join(', '),
  )
  check(
    'core journal stores no prompt text',
    page.records.every((entry) => entry.prompt === undefined),
  )

  await client.close()

  console.log('rotation')
  const previous = token
  token = createToken()
  const stale = await fetch(endpoint.url, {
    method: 'POST',
    headers: {
      'content-type': 'application/json',
      accept: 'application/json, text/event-stream',
      authorization: `Bearer ${previous}`,
    },
    body: JSON.stringify({ jsonrpc: '2.0', id: 1, method: 'tools/list' }),
  })
  check('the previous bearer stops working', stale.status === 401, `got ${String(stale.status)}`)

  const rotated = new Client({ name: 'smoke-rotated', version: '0' }, { capabilities: {} })
  await rotated.connect(
    new StreamableHTTPClientTransport(new URL(endpoint.url), {
      requestInit: { headers: { Authorization: `Bearer ${token}` } },
    }),
  )
  const afterRotation = await rotated.listTools()
  check('the new bearer works without a restart', afterRotation.tools.length === EXPECTED_TOOLS.length)
  await rotated.close()
} finally {
  await endpoint.close()
  await adapter.close()
  rmSync(journalDir, { recursive: true, force: true })
}

if (failures.length > 0) {
  console.error(`\n${String(failures.length)} check(s) failed`)
  process.exitCode = 1
} else {
  console.log('\nsmoke passed')
}
