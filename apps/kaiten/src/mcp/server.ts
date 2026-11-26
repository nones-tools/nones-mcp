#!/usr/bin/env node

import { startMcpServer } from './bootstrap';
import { errorLog } from './logger';

// Direct entry point (`bun run dev`, `node dist/mcp/server.js`). The published
// way to start the server is the `kaiten mcp` CLI command - both run the same
// `startMcpServer()` bootstrap.
startMcpServer().catch((error) => {
  errorLog('Fatal error starting MCP server', { message: error instanceof Error ? error.message : String(error) });
  process.exit(1);
});
