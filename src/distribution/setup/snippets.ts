import type { IntegrationClient } from './setup-types.js';

const installedServer = { command: 'relay', args: ['mcp'] as const };

export function renderIntegrationSnippet(client: IntegrationClient): string {
  if (client === 'codex') {
    return '[mcp_servers.relay]\ncommand = "relay"\nargs = ["mcp"]\n';
  }
  if (client === 'claude-code') {
    return `${JSON.stringify({ mcpServers: { relay: installedServer } }, null, 2)}\n`;
  }
  return `${JSON.stringify(installedServer, null, 2)}\n`;
}
