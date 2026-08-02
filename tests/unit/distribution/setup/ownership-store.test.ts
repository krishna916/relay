import { mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterEach, describe, expect, it } from 'vitest';
import { createOwnershipStore } from '../../../../src/distribution/setup/ownership-store.js';

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
    await store.write({
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
    });
    expect(JSON.parse(readFileSync(metadataPath, 'utf8')).integrations[0].configPath).toBe(
      join(root, 'codex.toml'),
    );
  });
});
