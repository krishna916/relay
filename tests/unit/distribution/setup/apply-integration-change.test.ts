import { mkdtempSync, readFileSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import { createCodexTomlAdapter } from '../../../../src/distribution/setup/clients/codex-toml-adapter.js';
import { applyIntegrationChange } from '../../../../src/distribution/setup/apply-integration-change.js';
import { planIntegrationChange } from '../../../../src/distribution/setup/plan-integration-change.js';
import { createOwnershipStore } from '../../../../src/distribution/setup/ownership-store.js';

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
    await ownershipStore.write({
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
    });
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
});
