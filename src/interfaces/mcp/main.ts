#!/usr/bin/env node
import { StdioServerTransport } from '@modelcontextprotocol/sdk/server/stdio.js';
import { createMcpServer } from './create-mcp-server.js';
import { mcpLogger } from './logger.js';
import { createTaskRuntime } from '../shared/create-task-runtime.js';
import { runMcpServer } from './run-mcp-server.js';

async function main(): Promise<void> {
  await runMcpServer({
    createRuntime: createTaskRuntime,
    createServer: createMcpServer,
    createTransport: () => new StdioServerTransport(),
    onSignal: (signal, handler) => process.on(signal, handler),
    reportFatal: (error) => {
      mcpLogger.error('Fatal error starting MCP stdio server', error);
      process.exitCode = 1;
    },
  });
}

void main();
