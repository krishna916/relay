import { describe, expect, it } from 'vitest';
import {
  createMcpHandshakeCheck,
  resolveInstalledRelayCommand,
} from '../../../../src/distribution/doctor/check-mcp.js';

describe('doctor MCP check', () => {
  it('resolves the installed CLI through the current Node executable', () => {
    expect(
      resolveInstalledRelayCommand({ execPath: 'node', argv1: '/installed/dist/cli/main.js' }),
    ).toEqual({
      command: 'node',
      prefixArgs: ['/installed/dist/cli/main.js'],
    });
  });

  it('sanitizes an installed command spawn failure and cleans its temporary root', async () => {
    let cleaned = false;
    const result = await createMcpHandshakeCheck({
      installedCommand: { command: 'missing-relay-command', prefixArgs: [] },
      temporaryRootFactory: async () => ({
        path: 'D:\\Temp\\doctor',
        cleanup: async () => {
          cleaned = true;
        },
      }),
    }).run();
    expect(result).toMatchObject({ status: 'failure', code: 'mcp.spawn-failed' });
    expect(JSON.stringify(result)).not.toContain('missing-relay-command');
    expect(cleaned).toBe(true);
  });
});
