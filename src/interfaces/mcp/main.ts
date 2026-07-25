import { StdioServerTransport } from '@modelcontextprotocol/sdk/server/stdio.js';
import { createMcpServer } from './create-mcp-server.js';
import { mcpLogger } from './logger.js';

async function main(): Promise<void> {
  try {
    const server = createMcpServer();
    const transport = new StdioServerTransport();
    let shuttingDown = false;

    const shutdown = async (signal: 'SIGINT' | 'SIGTERM'): Promise<void> => {
      if (shuttingDown) {
        return;
      }

      shuttingDown = true;
      mcpLogger.info(`Received ${signal}, shutting down MCP server...`);

      try {
        await server.close();
        process.exitCode = 0;
      } catch (error) {
        mcpLogger.error('Failed during MCP shutdown', error);
        process.exitCode = 1;
      } finally {
        process.exit();
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
    mcpLogger.error('Fatal error starting MCP stdio server', error);
    process.exit(1);
  }
}

void main();
