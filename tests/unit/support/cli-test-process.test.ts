import { describe, expect, it } from 'vitest';
import { createAgentTestRuntime } from '../../support/agent-test-runtime.js';
import { runRelayCli } from '../../support/cli-test-process.js';

describe('runRelayCli', () => {
  it('runs the built CLI from an arbitrary cwd and parses one JSON document', async () => {
    const runtime = await createAgentTestRuntime();
    try {
      const cwd = await runtime.createWorkingDirectory('cli/nested');
      const result = await runRelayCli(runtime, ['task', 'list', '--output', 'json'], { cwd });

      expect(result.exitCode).toBe(0);
      expect(result.stderr).toBe('');
      expect(result.json).toMatchObject({ schemaVersion: expect.any(Number) });
    } finally {
      await runtime.close();
    }
  });

  it('retains stdout, stderr, and a stable non-zero exit code on failure', async () => {
    const runtime = await createAgentTestRuntime();
    try {
      const result = await runRelayCli(runtime, ['task', 'get', 'missing-id', '--output', 'json']);

      expect(result.exitCode).toBe(3);
      expect(result.json).toMatchObject({
        schemaVersion: expect.any(Number),
        error: { code: 'NOT_FOUND', message: expect.any(String) },
      });
      expect(result.stdout.trim().split(/\r?\n/)).toHaveLength(1);
      expect(result.stderr).toContain('Task was not found.');
    } finally {
      await runtime.close();
    }
  });
});
