import { describe, expect, it } from 'vitest';
import { verifyLinuxMcpbStage } from '../../scripts/mcpb/verify-linux-mcpb.js';

const linuxIt = process.platform === 'linux' ? it : it.skip;

describe('Linux MCPB staged runtime', () => {
  linuxIt('runs the staged MCPB server with native SQLite from an unrelated cwd', async () => {
    const verification = await verifyLinuxMcpbStage();
    expect(verification.runtime).toMatchObject({
      platform: 'linux',
      node: process.version,
      modulesAbi: process.versions.modules,
      arch: process.arch,
    });
    expect(verification.tools).toEqual(
      expect.arrayContaining([
        'relay_health',
        'task_capture',
        'task_list',
        'task_get',
        'task_find_similar',
        'session_captures_list',
        'task_edit',
        'task_triage',
        'task_start',
        'task_complete',
        'task_archive',
      ]),
    );
    expect(verification.health).toMatchObject({ name: 'relay', status: 'ok' });
    expect(verification.sessionCount).toBe(1);
  });
});
