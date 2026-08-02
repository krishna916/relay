import { parse as parseToml } from '@iarna/toml';
import { describe, expect, it } from 'vitest';
import { renderIntegrationSnippet } from '../../../../src/distribution/setup/snippets.js';

describe('renderIntegrationSnippet', () => {
  it.each(['codex', 'claude-code', 'generic-mcp'] as const)(
    'renders the installed command for %s',
    (client) => {
      const snippet = renderIntegrationSnippet(client);
      expect(snippet.endsWith('\n')).toBe(true);
      expect(snippet).not.toMatch(/__RELAY_CHECKOUT__|RELAY_DB_PATH|node\s/);
      if (client === 'codex') {
        expect(parseToml(snippet)).toEqual({
          mcp_servers: { relay: { command: 'relay', args: ['mcp'] } },
        });
      } else {
        const parsed = JSON.parse(snippet) as Record<string, unknown>;
        const server =
          client === 'claude-code' ? (parsed.mcpServers as Record<string, unknown>).relay : parsed;
        expect(server).toEqual({ command: 'relay', args: ['mcp'] });
      }
    },
  );
});
