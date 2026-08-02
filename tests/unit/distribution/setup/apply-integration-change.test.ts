import {
  existsSync,
  mkdtempSync,
  readFileSync,
  readdirSync,
  statSync,
  writeFileSync,
} from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import { createCodexTomlAdapter } from '../../../../src/distribution/setup/clients/codex-toml-adapter.js';
import { createClaudeJsonAdapter } from '../../../../src/distribution/setup/clients/claude-json-adapter.js';
import { applyIntegrationChange } from '../../../../src/distribution/setup/apply-integration-change.js';
import { planIntegrationChange } from '../../../../src/distribution/setup/plan-integration-change.js';
import { createOwnershipStore } from '../../../../src/distribution/setup/ownership-store.js';
import type { OwnershipStore } from '../../../../src/distribution/setup/ownership-store.js';
import { SetupStorageError } from '../../../../src/distribution/setup/setup-errors.js';

describe('applyIntegrationChange', () => {
  it('updates the client before writing enabled ownership metadata', async () => {
    const root = mkdtempSync(join(tmpdir(), 'relay-apply-'));
    const path = join(root, 'codex.toml');
    const metadataPath = join(root, 'config.json');
    writeFileSync(path, '');
    const adapter = createCodexTomlAdapter();
    const ownershipStore = createOwnershipStore({ metadataPath, applicationVersion: '0.1.0' });
    const plan = await planIntegrationChange({
      action: 'setup',
      client: 'codex',
      configPath: path,
      adapter,
      ownership: await ownershipStore.read(),
    });
    const result = await applyIntegrationChange({
      plan,
      adapter,
      ownershipStore,
      applicationVersion: '0.1.0',
      now: new Date('2026-08-02T01:02:03.004Z'),
    });
    expect(result.operation).toBe('created');
    expect(readFileSync(path, 'utf8')).toContain('command = "relay"');
    await expect(ownershipStore.read()).resolves.toMatchObject({
      integrations: [{ status: 'enabled', client: 'codex' }],
    });
  });

  it('removes stale disabled ownership without rewriting an already absent client file', async () => {
    const root = mkdtempSync(join(tmpdir(), 'relay-apply-'));
    const path = join(root, 'codex.toml');
    const metadataPath = join(root, 'config.json');
    writeFileSync(path, '');
    const adapter = createCodexTomlAdapter();
    const ownershipStore = createOwnershipStore({ metadataPath, applicationVersion: '0.1.0' });
    await ownershipStore.update(() => ({
      schemaVersion: 1,
      integrations: [
        {
          client: 'codex',
          configPath: path,
          entryId: 'relay',
          command: 'relay',
          args: ['mcp'],
          status: 'disabled',
          applicationVersion: '0.1.0',
          lastSuccessfulSetupAt: '2026-08-02T01:02:03.004Z',
        },
      ],
    }));
    const plan = await planIntegrationChange({
      action: 'remove',
      client: 'codex',
      configPath: path,
      adapter,
      ownership: await ownershipStore.read(),
    });
    expect(plan.changed).toBe(true);
    const result = await applyIntegrationChange({
      plan,
      adapter,
      ownershipStore,
      applicationVersion: '0.1.0',
      now: new Date('2026-08-02T01:02:03.004Z'),
    });
    expect(result.operation).toBe('removed');
    expect(result.backupPath).toBeUndefined();
    await expect(ownershipStore.read()).resolves.toEqual({ schemaVersion: 1, integrations: [] });
  });

  it('preserves both ownership records when Codex and Claude apply concurrently', async () => {
    const root = mkdtempSync(join(tmpdir(), 'relay-apply-'));
    const codexPath = join(root, 'codex.toml');
    const claudePath = join(root, 'claude.json');
    const metadataPath = join(root, 'config.json');
    writeFileSync(codexPath, '');
    writeFileSync(claudePath, '');
    const codexAdapter = createCodexTomlAdapter();
    const claudeAdapter = createClaudeJsonAdapter();
    const codexStore = createOwnershipStore({ metadataPath, applicationVersion: '0.1.0' });
    const claudeStore = createOwnershipStore({ metadataPath, applicationVersion: '0.1.0' });
    const ownership = { schemaVersion: 1 as const, integrations: [] };
    const codexPlan = await planIntegrationChange({
      action: 'setup',
      client: 'codex',
      configPath: codexPath,
      adapter: codexAdapter,
      ownership,
    });
    const claudePlan = await planIntegrationChange({
      action: 'setup',
      client: 'claude-code',
      configPath: claudePath,
      adapter: claudeAdapter,
      ownership,
    });

    await Promise.all([
      applyIntegrationChange({
        plan: codexPlan,
        adapter: codexAdapter,
        ownershipStore: codexStore,
        applicationVersion: '0.1.0',
        now: new Date('2026-08-02T01:02:03.004Z'),
      }),
      applyIntegrationChange({
        plan: claudePlan,
        adapter: claudeAdapter,
        ownershipStore: claudeStore,
        applicationVersion: '0.1.0',
        now: new Date('2026-08-02T01:02:03.004Z'),
      }),
    ]);

    expect(readFileSync(codexPath, 'utf8')).toContain('command = "relay"');
    expect(readFileSync(claudePath, 'utf8')).toContain('"relay"');
    await expect(codexStore.read()).resolves.toMatchObject({
      integrations: [
        expect.objectContaining({ client: 'claude-code' }),
        expect.objectContaining({ client: 'codex' }),
      ],
    });
  });

  it('restores an absent config after metadata persistence fails and retains the backup', async () => {
    const root = mkdtempSync(join(tmpdir(), 'relay-apply-'));
    const path = join(root, 'codex.toml');
    const adapter = createCodexTomlAdapter();
    const plan = await planIntegrationChange({
      action: 'setup',
      client: 'codex',
      configPath: path,
      adapter,
      ownership: { schemaVersion: 1, integrations: [] },
    });
    const ownershipStore: OwnershipStore = {
      read: async () => ({ schemaVersion: 1, integrations: [] }),
      update: async () => {
        throw new SetupStorageError('forced metadata failure');
      },
    };

    await expect(
      applyIntegrationChange({
        plan,
        adapter,
        ownershipStore,
        applicationVersion: '0.1.0',
        now: new Date('2026-08-02T01:02:03.004Z'),
      }),
    ).rejects.toThrow(/restored after metadata persistence failed/i);
    expect(existsSync(path)).toBe(false);
    expect(readdirSync(root).some((name) => name.includes('.relay-backup-'))).toBe(true);
  });

  it('restores existing config bytes and mode after metadata persistence fails', async () => {
    const root = mkdtempSync(join(tmpdir(), 'relay-apply-'));
    const path = join(root, 'codex.toml');
    const original = '[profile]\nname = "existing"\n';
    writeFileSync(path, original);
    const originalMode = statSync(path).mode & 0o777;
    const adapter = createCodexTomlAdapter();
    const plan = await planIntegrationChange({
      action: 'setup',
      client: 'codex',
      configPath: path,
      adapter,
      ownership: { schemaVersion: 1, integrations: [] },
    });
    const ownershipStore: OwnershipStore = {
      read: async () => ({ schemaVersion: 1, integrations: [] }),
      update: async () => {
        throw new SetupStorageError('forced metadata failure');
      },
    };

    await expect(
      applyIntegrationChange({
        plan,
        adapter,
        ownershipStore,
        applicationVersion: '0.1.0',
        now: new Date('2026-08-02T01:02:03.004Z'),
      }),
    ).rejects.toThrow(/restored after metadata persistence failed/i);
    expect(readFileSync(path, 'utf8')).toBe(original);
    expect(statSync(path).mode & 0o777).toBe(originalMode);
  });
});
