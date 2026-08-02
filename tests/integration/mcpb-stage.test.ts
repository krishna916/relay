import { createRequire } from 'node:module';
import { existsSync } from 'node:fs';
import { lstat } from 'node:fs/promises';
import { join, relative } from 'node:path';
import { describe, expect, it } from 'vitest';
import {
  probeStagedStartupFailure,
  verifyLinuxMcpbStage,
} from '../../scripts/mcpb/verify-linux-mcpb.js';

const runLinuxMcpbStageTests =
  process.platform === 'linux' && process.env.RELAY_RUN_MCPB_STAGE_TESTS === '1';

describe.skipIf(!runLinuxMcpbStageTests)('Linux MCPB staged runtime', () => {
  it('includes the staged MCP entry point and native SQLite addon', async () => {
    const stageDir = join(process.cwd(), '.mcpb', 'relay');
    const serverPath = join(stageDir, 'server', 'main.js');
    expect(existsSync(serverPath)).toBe(true);

    const requireFromStage = createRequire(join(stageDir, 'package.json'));
    const resolvedDatabase = requireFromStage.resolve('better-sqlite3');
    expect(relative(stageDir, resolvedDatabase)).not.toMatch(/^\.\.(?:[/\\]|$)/);
    const Database = requireFromStage('better-sqlite3') as {
      new (filename: string): { close: () => void };
    };
    const database = new Database(':memory:');
    database.close();
  });

  it('materializes SDK transitive dependencies without archive-fragile symlinks', async () => {
    const dependencyPath = join(
      process.cwd(),
      '.mcpb',
      'relay',
      'node_modules',
      'zod-to-json-schema',
    );
    const dependency = await lstat(dependencyPath);

    expect(dependency.isDirectory()).toBe(true);
    expect(dependency.isSymbolicLink()).toBe(false);
  });

  it('runs the staged MCPB server with native SQLite from an unrelated cwd', async () => {
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
    expect(verification.stderr).toBe('');
  }, 120_000);

  it('keeps staged startup failures off stdout and reports them on stderr', async () => {
    const failure = await probeStagedStartupFailure();

    expect(failure.exitCode).not.toBe(0);
    expect(failure.stdout).toBe('');
    expect(failure.stderr).toContain('[ERROR] Fatal error starting MCP stdio server');
  }, 120_000);
});
