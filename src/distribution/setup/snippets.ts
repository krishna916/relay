import type { IntegrationClient } from './setup-types.js';
import { RELAY_ENTRY } from './relay-entry.js';

export function renderIntegrationSnippet(client: IntegrationClient): string {
  if (client === 'codex') {
    return '[mcp_servers.relay]\ncommand = "relay"\nargs = ["mcp"]\n';
  }
  if (client === 'claude-code') {
    return `${JSON.stringify({ mcpServers: { relay: RELAY_ENTRY } }, null, 2)}\n`;
  }
  return `${JSON.stringify(RELAY_ENTRY, null, 2)}\n`;
}
