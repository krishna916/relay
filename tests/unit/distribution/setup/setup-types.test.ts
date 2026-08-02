import { describe, expect, it } from 'vitest';
import type {
  IntegrationChangePlan,
  IntegrationClient,
  RelayOwnershipFile,
} from '../../../../src/distribution/setup/setup-types.js';
import type { ClientConfigAdapter } from '../../../../src/distribution/setup/clients/client-adapter.js';

describe('setup contracts', () => {
  it('freezes the supported clients and installed Relay entry identity', () => {
    const client: IntegrationClient = 'generic-mcp';
    const ownership: RelayOwnershipFile = { schemaVersion: 1, integrations: [] };
    const plan: IntegrationChangePlan = {
      client: 'codex',
      configPath: 'C:/tmp/codex.toml',
      entryId: 'relay',
      operation: 'created',
      changed: true,
      beforeFingerprint: 'digest',
      nextContent: '[mcp_servers.relay]\ncommand = "relay"\nargs = ["mcp"]\n',
      snippet: '[mcp_servers.relay]\ncommand = "relay"\nargs = ["mcp"]\n',
    };
    const adapter: ClientConfigAdapter = {
      client: 'claude-code',
      parse: () => undefined,
      inspect: () => ({ kind: 'absent' }),
      upsertRelayEntry: (content) => content,
      removeRelayEntry: (content) => content,
      renderSnippet: () => '{}\n',
    };

    expect(client).toBe('generic-mcp');
    expect(ownership).toEqual({ schemaVersion: 1, integrations: [] });
    expect(plan.entryId).toBe('relay');
    expect(adapter.client).toBe('claude-code');
  });
});
