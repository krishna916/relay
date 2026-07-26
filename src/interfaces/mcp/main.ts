import { StdioServerTransport } from '@modelcontextprotocol/sdk/server/stdio.js';
import { createMcpServer } from './create-mcp-server.js';
import { mcpLogger } from './logger.js';
import { createTaskRuntime } from '../shared/create-task-runtime.js';
import type { TaskRuntime } from '../shared/create-task-runtime.js';

async function main(): Promise<void> {
  let runtime: TaskRuntime | null = null;
  let server: ReturnType<typeof createMcpServer> | null = null;
  try {
    runtime = createTaskRuntime();
    const activeRuntime = runtime;
    server = createMcpServer(activeRuntime.taskApplication);
    const activeServer = server;
    const transport = new StdioServerTransport();
    let shuttingDown = false;

    const shutdown = async (signal: 'SIGINT' | 'SIGTERM'): Promise<void> => {
      if (shuttingDown) {
        return;
      }

      shuttingDown = true;
      mcpLogger.info(`Received ${signal}, shutting down MCP server...`);

      try {
        await activeServer.close();
        process.exitCode = 0;
      } catch (error) {
        mcpLogger.error('Failed during MCP shutdown', error);
        process.exitCode = 1;
      } finally {
        activeRuntime.close();
      }
    };

    process.on('SIGINT', () => {
      void shutdown('SIGINT');
    });

    process.on('SIGTERM', () => {
      void shutdown('SIGTERM');
    });

    await server.connect(transport);
  } catch (error) {
    await server?.close();
    runtime?.close();
    mcpLogger.error('Fatal error starting MCP stdio server', error);
    process.exit(1);
  }
}

void main();
