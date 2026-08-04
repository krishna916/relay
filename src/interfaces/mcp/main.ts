#!/usr/bin/env node
import { StdioServerTransport } from '@modelcontextprotocol/sdk/server/stdio.js';
import { writeFileSync } from 'node:fs';
import { createMcpServer } from './create-mcp-server.js';
import { mcpLogger } from './logger.js';
import { createTaskRuntime } from '../shared/create-task-runtime.js';
import { runMcpServer as runMcpServerWithDependencies } from './run-mcp-server.js';

export async function runMcpServer(): Promise<number> {
  if (
    process.env.RELAY_DOCTOR_TEST_HOLD_PROBE === 'mcp' &&
    (process.env.NODE_ENV === 'test' || process.env.RELAY_RUN_PACKAGE_SMOKE === '1')
  ) {
    const marker = process.env.RELAY_DOCTOR_TEST_CHILD_MARKER;
    if (marker !== undefined) writeFileSync(marker, String(process.pid));
  }
  const started = await runMcpServerWithDependencies({
    createRuntime: createTaskRuntime,
    createServer: createMcpServer,
    createTransport: () => new StdioServerTransport(),
    onSignal: (signal, handler) => process.on(signal, handler),
    reportFatal: (error) => {
      mcpLogger.error('Fatal error starting MCP stdio server', error);
      process.exitCode = 1;
    },
  });
  return started ? 0 : 1;
}

if (/(?:[\\/]mcp|[\\/]server)[\\/]main\.(?:js|ts)$/.test(process.argv[1] ?? ''))
  void runMcpServer();
