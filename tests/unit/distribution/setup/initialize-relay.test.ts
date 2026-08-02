import { existsSync, mkdirSync, mkdtempSync, rmSync } from 'node:fs';
import type { mkdir as mkdirFunction } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterEach, describe, expect, it } from 'vitest';
import { initializeRelay } from '../../../../src/distribution/setup/initialize-relay.js';
import { SetupStorageError } from '../../../../src/distribution/setup/setup-errors.js';

describe('initializeRelay', () => {
  const roots: string[] = [];
  afterEach(() =>
    roots.splice(0).forEach((root) => rmSync(root, { recursive: true, force: true })),
  );

  it('creates Relay roots and opens the canonical runtime exactly once', async () => {
    const root = mkdtempSync(join(tmpdir(), 'relay-init-'));
    roots.push(root);
    const dataRoot = join(root, 'data');
    const configRoot = join(root, 'config');
    const calls: string[] = [];
    const result = await initializeRelay({
      runtimePaths: {
        dataRoot,
        configRoot,
        cacheRoot: join(root, 'cache'),
        databasePath: join(dataRoot, 'relay.db'),
      },
      mkdir: (async (path, options) => {
        const textPath = path.toString();
        mkdirSync(textPath, options);
        calls.push(textPath);
        return join(root, 'shared');
      }) as typeof mkdirFunction,
      openRuntime: (databasePath) => {
        calls.push(databasePath);
        return { close: () => calls.push('closed') };
      },
    });

    expect(result.createdDirectories).toEqual([dataRoot, configRoot]);
    expect(calls).toEqual([dataRoot, configRoot, join(dataRoot, 'relay.db'), 'closed']);
  });

  it('closes the runtime when initialization returns', async () => {
    const root = mkdtempSync(join(tmpdir(), 'relay-init-'));
    roots.push(root);
    let closed = 0;
    await initializeRelay({
      runtimePaths: {
        dataRoot: join(root, 'data'),
        configRoot: join(root, 'config'),
        cacheRoot: join(root, 'cache'),
        databasePath: join(root, 'relay.db'),
      },
      mkdir: async () => undefined,
      openRuntime: () => ({
        close: () => {
          closed += 1;
        },
      }),
    });
    expect(closed).toBe(1);
  });

  it('does not create metadata as a side effect of a runtime failure', async () => {
    const root = mkdtempSync(join(tmpdir(), 'relay-init-'));
    roots.push(root);
    const metadataPath = join(root, 'config', 'config.json');
    const error = await initializeRelay({
      runtimePaths: {
        dataRoot: join(root, 'data'),
        configRoot: join(root, 'config'),
        cacheRoot: join(root, 'cache'),
        databasePath: join(root, 'relay.db'),
      },
      mkdir: async () => undefined,
      openRuntime: () => {
        throw new Error('migration failed');
      },
    }).catch((caught: unknown) => caught);
    expect(error).toBeInstanceOf(SetupStorageError);
    expect((error as SetupStorageError).cause).toMatchObject({ message: 'migration failed' });
    expect(existsSync(metadataPath)).toBe(false);
  });
});
