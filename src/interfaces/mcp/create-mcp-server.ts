import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { getHealth } from '../../application/health/get-health.js';
import { getPackageMetadata } from '../../shared/package-metadata.js';
import type { TaskApplication } from '../../application/tasks/task-application.js';
import { registerReadTools } from './tools/register-read-tools.js';
import { registerTaskCaptureTool } from './tools/task-capture.js';

export function createMcpServer(taskApplication: TaskApplication): McpServer {
  const meta = getPackageMetadata();
  const server = new McpServer({
    name: meta.name,
    version: meta.version,
  });
  registerReadTools(server, taskApplication);
  registerTaskCaptureTool(server, taskApplication);

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
