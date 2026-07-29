import { stat } from 'node:fs/promises';
import { homedir } from 'node:os';
import { dirname, isAbsolute } from 'node:path';
import { describe, expect, it } from 'vitest';
import { createAgentTestRuntime } from '../../support/agent-test-runtime.js';

describe('createAgentTestRuntime', () => {
  it('creates an isolated absolute database path and arbitrary working directories', async () => {
    const runtime = await createAgentTestRuntime();
    try {
      expect(runtime.databasePath).toMatch(/relay\.db$/);
      expect(isAbsolute(runtime.databasePath)).toBe(true);
      expect(runtime.databasePath).not.toContain(homedir());

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
