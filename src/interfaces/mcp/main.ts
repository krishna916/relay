#!/usr/bin/env node
import { StdioServerTransport } from '@modelcontextprotocol/sdk/server/stdio.js';
import { createMcpServer } from './create-mcp-server.js';
import { mcpLogger } from './logger.js';
import { createTaskRuntime } from '../shared/create-task-runtime.js';
import { runMcpServer as runMcpServerWithDependencies } from './run-mcp-server.js';
import { writeDoctorProbeMarker } from './doctor-probe-marker.js';

export async function runMcpServer(): Promise<number> {
  writeDoctorProbeMarker();
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
