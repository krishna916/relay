import { describe, expect, it } from 'vitest';
import type { ClientConfigAdapter } from '../../../../src/distribution/setup/clients/client-adapter.js';
import type { OwnershipStore } from '../../../../src/distribution/setup/ownership-store.js';
import type { RelayOwnershipFile } from '../../../../src/distribution/setup/setup-types.js';
import type { readFile as readFileFunction } from 'node:fs/promises';
import { createIntegrationChecks } from '../../../../src/distribution/doctor/check-integrations.js';

const emptyOwnership: RelayOwnershipFile = { schemaVersion: 1, integrations: [] };

function store(ownership: RelayOwnershipFile): OwnershipStore {
  return { read: async () => ownership, update: async () => ownership };
}

function adapter(
  client: 'codex' | 'claude-code',
  state: 'matching' | 'absent' | 'conflicting',
): ClientConfigAdapter {
  return {
    client,
    parse: () => undefined,
    inspect: () => ({ kind: state }),
    upsertRelayEntry: (content) => content,
    removeRelayEntry: (content) => content,
    renderSnippet: () => '',
  };
}

describe('doctor integration checks', () => {
  it('warns for unowned native clients and skips generic user configuration', async () => {
    const [codex, claude, generic] = createIntegrationChecks({
      ownershipStore: store(emptyOwnership),
      adapters: {
        codex: adapter('codex', 'matching'),
        'claude-code': adapter('claude-code', 'matching'),
      },
      integrationsDir: '/tmp/relay-integrations',
      readFile: (async () =>
        JSON.stringify({ command: 'relay', args: ['mcp'] })) as unknown as typeof readFileFunction,
      access: async () => undefined,
    });
    await expect(codex.run()).resolves.toMatchObject({
      status: 'warning',
      code: 'integrations.codex.not-configured',
    });
    await expect(claude.run()).resolves.toMatchObject({
      status: 'warning',
      code: 'integrations.claude-code.not-configured',
    });
    await expect(generic.run()).resolves.toMatchObject({
      status: 'skipped',
      code: 'integrations.generic-mcp.user-config-not-owned',
    });
  });

  it('fails an enabled owned client whose recorded entry is conflicting', async () => {
    const ownership: RelayOwnershipFile = {
      schemaVersion: 1,
      integrations: [
        {
          client: 'codex',
          configPath: '/tmp/codex.toml',
          entryId: 'relay',
          command: 'relay',
          args: ['mcp'],
          status: 'enabled',
          applicationVersion: '0.1.0',
          lastSuccessfulSetupAt: '2026-08-04T00:00:00.000Z',
        },
      ],
    };
    const [codex] = createIntegrationChecks({
      ownershipStore: store(ownership),
      adapters: {
        codex: adapter('codex', 'conflicting'),
        'claude-code': adapter('claude-code', 'matching'),
      },
      integrationsDir: '/tmp/relay-integrations',
      readFile: (async () => 'safe fixture') as unknown as typeof readFileFunction,
      access: async () => undefined,
    });
    await expect(codex.run()).resolves.toMatchObject({
      status: 'failure',
      code: 'integrations.codex.entry-conflict',
      message: 'The owned Codex Relay entry is missing or conflicting.',
    });
  });

  it('rejects an invalid packaged generic template without exposing its contents', async () => {
    const [, , generic] = createIntegrationChecks({
      ownershipStore: store(emptyOwnership),
      adapters: {
        codex: adapter('codex', 'matching'),
        'claude-code': adapter('claude-code', 'matching'),
      },
      integrationsDir: '/tmp/relay-integrations',
      readFile: (async () =>
        JSON.stringify({
          command: 'node',
          args: ['unexpected', 'secret'],
        })) as unknown as typeof readFileFunction,
      access: async () => undefined,
    });
    const result = await generic.run();
    expect(result).toMatchObject({
      status: 'failure',
      code: 'integrations.generic-mcp.template-invalid',
    });
    expect(JSON.stringify(result)).not.toContain('secret');
  });

  it('reports invalid ownership metadata safely', async () => {
    const [codex] = createIntegrationChecks({
      ownershipStore: {
        read: async () => {
          throw new Error('ownership secret');
        },
        update: async () => emptyOwnership,
      },
      adapters: {
        codex: adapter('codex', 'matching'),
        'claude-code': adapter('claude-code', 'matching'),
      },
      integrationsDir: '/tmp/relay-integrations',
      readFile: (async () => '') as unknown as typeof readFileFunction,
      access: async () => undefined,
    });
    await expect(codex.run()).resolves.toMatchObject({
      status: 'failure',
      code: 'integrations.codex.ownership-invalid',
    });
  });

  it('reports disabled owned records', async () => {
    const [codex] = createIntegrationChecks({
      ownershipStore: store({
        schemaVersion: 1,
        integrations: [
          {
            client: 'codex',
            configPath: '/tmp/codex.toml',
            entryId: 'relay',
            command: 'relay',
            args: ['mcp'],
            status: 'disabled',
            applicationVersion: '0.1.0',
            lastSuccessfulSetupAt: '2026-08-04T00:00:00.000Z',
          },
        ],
      }),
      adapters: {
        codex: adapter('codex', 'matching'),
        'claude-code': adapter('claude-code', 'matching'),
      },
      integrationsDir: '/tmp/relay-integrations',
      readFile: (async () => '') as unknown as typeof readFileFunction,
      access: async () => undefined,
    });
    await expect(codex.run()).resolves.toMatchObject({
      status: 'warning',
      code: 'integrations.codex.disabled',
    });
  });

  it('reports unreadable and unparsable owned configuration files', async () => {
    const ownership: RelayOwnershipFile = {
      schemaVersion: 1,
      integrations: [
        {
          client: 'codex',
          configPath: '/tmp/codex.toml',
          entryId: 'relay',
          command: 'relay',
          args: ['mcp'],
          status: 'enabled',
          applicationVersion: '0.1.0',
          lastSuccessfulSetupAt: '2026-08-04T00:00:00.000Z',
        },
      ],
    };
    const [unreadable] = createIntegrationChecks({
      ownershipStore: store(ownership),
      adapters: {
        codex: adapter('codex', 'matching'),
        'claude-code': adapter('claude-code', 'matching'),
      },
      integrationsDir: '/tmp/relay-integrations',
      readFile: (async () => 'safe') as unknown as typeof readFileFunction,
      access: async () => {
        throw new Error('unreadable');
      },
    });
    await expect(unreadable.run()).resolves.toMatchObject({
      status: 'failure',
      code: 'integrations.codex.file-unreadable',
    });

    const [unparsable] = createIntegrationChecks({
      ownershipStore: store(ownership),
      adapters: {
        codex: {
          ...adapter('codex', 'matching'),
          parse: () => {
            throw new Error('malformed');
          },
        },
        'claude-code': adapter('claude-code', 'matching'),
      },
      integrationsDir: '/tmp/relay-integrations',
      readFile: (async () => 'malformed') as unknown as typeof readFileFunction,
      access: async () => undefined,
    });
    await expect(unparsable.run()).resolves.toMatchObject({
      status: 'failure',
      code: 'integrations.codex.config-unparsable',
    });
  });

  it('reports an unreadable generic MCP template separately from an invalid shape', async () => {
    const [, , generic] = createIntegrationChecks({
      ownershipStore: store(emptyOwnership),
      adapters: {
        codex: adapter('codex', 'matching'),
        'claude-code': adapter('claude-code', 'matching'),
      },
      integrationsDir: '/tmp/relay-integrations',
      readFile: (async () => '') as unknown as typeof readFileFunction,
      access: async () => {
        throw new Error('template unreadable');
      },
    });
    await expect(generic.run()).resolves.toMatchObject({
      status: 'failure',
      code: 'integrations.generic-mcp.template-unreadable',
    });
  });
});
