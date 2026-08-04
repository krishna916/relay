import { describe, expect, it } from 'vitest';
import { join } from 'node:path';
import { createUiLoopbackCheck } from '../../../../src/distribution/doctor/check-ui.js';

const fixtureDir = join(process.cwd(), 'tests', 'fixtures', 'doctor', 'process');

describe('doctor UI check', () => {
  it('reports a failed installed UI command without exposing child output', async () => {
    let cleaned = false;
    const result = await createUiLoopbackCheck({
      installedCommand: { command: 'missing-relay-command', prefixArgs: [] },
      temporaryRootFactory: async () => ({
        path: 'D:\\Temp\\doctor',
        cleanup: async () => {
          cleaned = true;
        },
      }),
      fetch: globalThis.fetch,
    }).run();
    expect(result).toMatchObject({ status: 'failure', code: 'ui.start-failed' });
    expect(JSON.stringify(result)).not.toContain('missing-relay-command');
    expect(cleaned).toBe(true);
  });

  it('fails a UI health request that never completes', async () => {
    const result = await createUiLoopbackCheck({
      installedCommand: {
        command: process.execPath,
        prefixArgs: [join(fixtureDir, 'ui-ready-child.mjs')],
      },
      temporaryRootFactory: async () => ({
        path: process.cwd(),
        cleanup: async () => undefined,
      }),
      fetch: () => new Promise<Response>(() => undefined),
      requestTimeoutMs: 10,
    }).run();
    expect(result).toMatchObject({ status: 'failure', code: 'ui.health-timeout' });
  });
});
