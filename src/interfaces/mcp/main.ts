import { StdioServerTransport } from '@modelcontextprotocol/sdk/server/stdio.js';
import { createMcpServer } from './create-mcp-server.js';
import { mcpLogger } from './logger.js';

async function main(): Promise<void> {
  try {
    const server = createMcpServer();
    const transport = new StdioServerTransport();

    process.on('SIGINT', () => {
      mcpLogger.info('Received SIGINT, shutting down MCP server...');
      process.exit(0);
    });

    process.on('SIGTERM', () => {
      mcpLogger.info('Received SIGTERM, shutting down MCP server...');
      process.exit(0);
    });

    await server.connect(transport);
  } catch (error) {
    mcpLogger.error('Fatal error starting MCP stdio server', error);
    process.exit(1);
  }
}

void main();
