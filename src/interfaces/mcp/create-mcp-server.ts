import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { getHealth } from '../../application/health/get-health.js';
import { getPackageMetadata } from '../../shared/package-metadata.js';

export function createMcpServer(): McpServer {
  const meta = getPackageMetadata();
  const server = new McpServer({
    name: meta.name,
    version: meta.version,
  });

  server.tool('relay_health', 'Return health status of the local Relay service', {}, async () => {
    const health = getHealth();
    return {
      content: [
        {
          type: 'text',
          text: JSON.stringify(health),
        },
      ],
    };
  });

  return server;
}
