import { execFileSync, spawnSync } from 'node:child_process';
import { existsSync, mkdirSync, mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { beforeAll, describe, expect, it } from 'vitest';

const repositoryRoot = resolve(dirname(fileURLToPath(import.meta.url)), '../..');
const cliPath = join(repositoryRoot, 'dist', 'cli', 'main.js');

interface CliRun {
  readonly status: number | null;
  readonly stdout: string;
  readonly stderr: string;
}

interface CliEnvelope {
  readonly ok: boolean;
  readonly data: {
    readonly task: { readonly id: string; readonly title?: string; readonly status?: string };
    readonly count: number;
    readonly change: { readonly action: string; readonly from?: string; readonly to?: string };
  };
  readonly error: { readonly code: string; readonly message: string };
}

function runCli(workspace: string, databasePath: string, args: readonly string[]): CliRun {
  const result = spawnSync(process.execPath, [cliPath, ...args], {
    cwd: workspace,
    env: { ...process.env, RELAY_DB_PATH: databasePath },
    encoding: 'utf8',
  });
  return {
    status: result.status,
    stdout: result.stdout,
    stderr: result.stderr,
  };
}

function parseSingleEnvelope(run: CliRun): CliEnvelope {
  expect(run.stdout.endsWith('\n')).toBe(true);
  expect(run.stdout.trim().split('\n')).toHaveLength(1);
  return JSON.parse(run.stdout) as CliEnvelope;
}

describe('built CLI', () => {
  beforeAll(() => {
    if (process.platform === 'win32') {
      execFileSync(process.env.ComSpec ?? 'cmd.exe', ['/d', '/s', '/c', 'pnpm build:node'], {
        cwd: repositoryRoot,
        stdio: 'pipe',
      });
    } else {
      execFileSync('pnpm', ['build:node'], { cwd: repositoryRoot, stdio: 'pipe' });
    }
  });

  it('persists task operations across short-lived processes from an arbitrary CWD', () => {
    const workspace = mkdtempSync(join(tmpdir(), 'relay-cli-cwd-'));
    const databasePath = join(workspace, 'relay.db');
    try {
      const capture = runCli(workspace, databasePath, [
        'task',
        'capture',
        '--title',
        'Built CLI task',
        '--agent',
        'Codex',
        '--session',
        'session-built',
        '--workspace',
        'relay',
        '--output',
        'json',
      ]);
      expect(capture.status).toBe(0);
      expect(capture.stderr).toBe('');
      const captureEnvelope = parseSingleEnvelope(capture);
      const taskId = captureEnvelope.data.task.id as string;

      const get = runCli(workspace, databasePath, ['task', 'get', taskId, '--output', 'json']);
      expect(get.status).toBe(0);
      expect(get.stderr).toBe('');
      expect(parseSingleEnvelope(get).data.task).toMatchObject({
        id: taskId,
        title: 'Built CLI task',
      });

      const list = runCli(workspace, databasePath, [
        'task',
        'list',
        '--status',
        'INBOX',
        '--workspace',
        'relay',
        '--output',
        'json',
      ]);
      expect(list.status).toBe(0);
      expect(parseSingleEnvelope(list).data.count).toBe(1);

      const session = runCli(workspace, databasePath, [
        'session',
        'captures',
        '--session',
        'session-built',
        '--output',
        'json',
      ]);
      expect(session.status).toBe(0);
      expect(parseSingleEnvelope(session).data.count).toBe(1);

      const triage = runCli(workspace, databasePath, [
        'task',
        'triage',
        taskId,
        '--to',
        'ACTIVE',
        '--output',
        'json',
      ]);
      expect(triage.status).toBe(0);
      expect(parseSingleEnvelope(triage).data.change).toEqual({
        action: 'TRIAGED',
        from: 'INBOX',
        to: 'ACTIVE',
      });

      const start = runCli(workspace, databasePath, ['task', 'start', taskId, '--output', 'json']);
      expect(start.status).toBe(0);
      expect(parseSingleEnvelope(start).data.task.status).toBe('IN_PROGRESS');

      const complete = runCli(workspace, databasePath, [
        'task',
        'complete',
        taskId,
        '--output',
        'json',
      ]);
      expect(complete.status).toBe(0);
      expect(parseSingleEnvelope(complete).data.task.status).toBe('DONE');

      const archive = runCli(workspace, databasePath, [
        'task',
        'archive',
        taskId,
        '--output',
        'json',
      ]);
      expect(archive.status).toBe(0);
      expect(parseSingleEnvelope(archive).data.task.status).toBe('ARCHIVED');
    } finally {
      rmSync(workspace, { recursive: true, force: true });
    }
  }, 15_000);

  it('validates before runtime creation and maps an isolated storage failure', () => {
    const workspace = mkdtempSync(join(tmpdir(), 'relay-cli-validation-'));
    const databasePath = join(workspace, 'nested', 'relay.db');
    try {
      const invalid = runCli(workspace, databasePath, ['task', 'get']);
      expect(invalid.status).toBe(2);
      expect(parseSingleEnvelope(invalid)).toMatchObject({
        ok: false,
        error: { code: 'VALIDATION_ERROR' },
      });
      expect(invalid.stderr).toContain('task id');
      expect(existsSync(databasePath)).toBe(false);

      const storageDirectory = join(workspace, 'database-directory');
      mkdirSync(storageDirectory);
      const storage = runCli(workspace, storageDirectory, ['task', 'list', '--output', 'json']);
      expect(storage.status).toBe(5);
      expect(parseSingleEnvelope(storage)).toMatchObject({
        ok: false,
        error: { code: 'STORAGE_ERROR' },
      });
      expect(storage.stderr).toContain('Task storage operation failed.');
    } finally {
      rmSync(workspace, { recursive: true, force: true });
    }
  });
});
