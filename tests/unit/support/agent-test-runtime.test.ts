import { rm, stat } from 'node:fs/promises';
import { dirname, isAbsolute, join, relative, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';
import { getDefaultDatabasePath } from '../../../src/database/database-config.js';
import { createAgentTestRuntime } from '../../support/agent-test-runtime.js';

describe('createAgentTestRuntime', () => {
  it('creates an isolated absolute database path and arbitrary working directories', async () => {
    const runtime = await createAgentTestRuntime();
    try {
      const disposableRoot = dirname(dirname(runtime.databasePath));
      const repositoryTemporaryRoot = resolve(
        dirname(fileURLToPath(import.meta.url)),
        '../../..',
        'tmp',
      );

      expect(runtime.databasePath).toBe(join(disposableRoot, 'data', 'relay.db'));
      expect(isAbsolute(runtime.databasePath)).toBe(true);
      expect(relative(repositoryTemporaryRoot, disposableRoot)).not.toMatch(/^\.\.(?:[\\/]|$)/);
      expect(runtime.databasePath).not.toBe(getDefaultDatabasePath());

      const cwd = await runtime.createWorkingDirectory('nested/client');
      expect(isAbsolute(cwd)).toBe(true);
      expect(cwd).not.toBe(runtime.checkoutPath);

      const environment = runtime.environment({ RELAY_TEST_MARKER: 'isolated' });
      expect(environment.RELAY_DB_PATH).toBe(runtime.databasePath);
      expect(environment.RELAY_TEST_MARKER).toBe('isolated');
    } finally {
      await runtime.close();
    }
  });

  it('creates the shared temporary parent when it is absent', async () => {
    const repositoryTemporaryRoot = resolve(
      dirname(fileURLToPath(import.meta.url)),
      '../../..',
      'tmp',
    );
    await rm(repositoryTemporaryRoot, { recursive: true, force: true });

    const runtime = await createAgentTestRuntime();
    try {
      expect(runtime.databasePath).toContain(join('tmp', 'relay-agent-verification-'));
      await expect(stat(dirname(runtime.databasePath))).resolves.toBeDefined();
    } finally {
      await runtime.close();
    }
  });

  it('removes the disposable directory including SQLite sidecars and closes idempotently', async () => {
    const runtime = await createAgentTestRuntime();
    const root = dirname(dirname(runtime.databasePath));
    await import('node:fs/promises').then(({ writeFile }) =>
      Promise.all([
        writeFile(`${runtime.databasePath}-wal`, 'test'),
        writeFile(`${runtime.databasePath}-shm`, 'test'),
      ]),
    );

    await runtime.close();
    await runtime.close();

    await expect(stat(root)).rejects.toMatchObject({ code: 'ENOENT' });
  });
});
