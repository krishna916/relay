import { mkdtempSync, readFileSync, rmSync, unlinkSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterEach, describe, expect, it } from 'vitest';
import { createOwnershipStore } from '../../../../src/distribution/setup/ownership-store.js';
import { SetupConflictError } from '../../../../src/distribution/setup/setup-errors.js';

describe('ownership store', () => {
  const roots: string[] = [];
  afterEach(() =>
    roots.splice(0).forEach((root) => rmSync(root, { recursive: true, force: true })),
  );

  it('reads missing metadata as an empty schema', async () => {
    const root = mkdtempSync(join(tmpdir(), 'relay-ownership-'));
    roots.push(root);
    await expect(
      createOwnershipStore({
        metadataPath: join(root, 'config.json'),
        applicationVersion: '0.1.0',
      }).read(),
    ).resolves.toEqual({ schemaVersion: 1, integrations: [] });
  });

  it('rejects malformed and unsafe ownership records', async () => {
    const root = mkdtempSync(join(tmpdir(), 'relay-ownership-'));
    roots.push(root);
    const metadataPath = join(root, 'config.json');
    writeFileSync(metadataPath, JSON.stringify({ schemaVersion: 2, integrations: [] }));
    await expect(
      createOwnershipStore({ metadataPath, applicationVersion: '0.1.0' }).read(),
    ).rejects.toThrow(/schema/i);
  });

  it('normalizes and sorts valid records on read and writes atomically', async () => {
    const root = mkdtempSync(join(tmpdir(), 'relay-ownership-'));
    roots.push(root);
    const metadataPath = join(root, 'config.json');
    const store = createOwnershipStore({ metadataPath, applicationVersion: '0.1.0' });
    await store.update(() => ({
      schemaVersion: 1,
      integrations: [
        {
          client: 'codex',
          configPath: join(root, 'nested', '..', 'codex.toml'),
          entryId: 'relay',
          command: 'relay',
          args: ['mcp'],
          status: 'enabled',
          applicationVersion: '0.1.0',
          lastSuccessfulSetupAt: '2026-08-02T00:00:00.000Z',
        },
      ],
    }));
    expect(JSON.parse(readFileSync(metadataPath, 'utf8')).integrations[0].configPath).toBe(
      join(root, 'codex.toml'),
    );
  });

  it('preserves both records when independent stores update concurrently', async () => {
    const root = mkdtempSync(join(tmpdir(), 'relay-ownership-'));
    roots.push(root);
    const metadataPath = join(root, 'config.json');
    const codexPath = join(root, 'codex.toml');
    const claudePath = join(root, 'claude.json');
    const first = createOwnershipStore({ metadataPath, applicationVersion: '0.1.0' });
    const second = createOwnershipStore({ metadataPath, applicationVersion: '0.1.0' });
    const record = (client: 'codex' | 'claude-code', configPath: string) => ({
      client,
      configPath,
      entryId: 'relay' as const,
      command: 'relay' as const,
      args: ['mcp'] as const,
      status: 'enabled' as const,
      applicationVersion: '0.1.0',
      lastSuccessfulSetupAt: '2026-08-02T00:00:00.000Z',
    });

    await Promise.all([
      first.update((current) => ({
        schemaVersion: 1,
        integrations: [...current.integrations, record('codex', codexPath)],
      })),
      second.update((current) => ({
        schemaVersion: 1,
        integrations: [...current.integrations, record('claude-code', claudePath)],
      })),
    ]);

    await expect(first.read()).resolves.toMatchObject({
      integrations: [
        expect.objectContaining({ client: 'claude-code', configPath: claudePath }),
        expect.objectContaining({ client: 'codex', configPath: codexPath }),
      ],
    });
  });

  it('fails with an actionable conflict when the ownership lock remains held', async () => {
    const root = mkdtempSync(join(tmpdir(), 'relay-ownership-'));
    roots.push(root);
    const metadataPath = join(root, 'config.json');
    const lockPath = `${metadataPath}.relay-lock`;
    writeFileSync(lockPath, 'held');
    const store = createOwnershipStore({
      metadataPath,
      applicationVersion: '0.1.0',
      lockRetryDelayMs: 0,
      lockMaxAttempts: 2,
      sleep: async () => undefined,
    });
    try {
      await expect(store.update((current) => current)).rejects.toMatchObject({
        constructor: SetupConflictError,
        message: expect.stringMatching(/in progress.*retry/i),
      });
    } finally {
      unlinkSync(lockPath);
    }
  });
});
