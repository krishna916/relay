import { existsSync, mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { spawnSync } from 'node:child_process';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterEach, describe, expect, it } from 'vitest';

interface CliRun {
  readonly status: number | null;
  readonly stdout: string;
  readonly stderr: string;
}

describe('installed setup workflow', () => {
  const roots: string[] = [];
  afterEach(() =>
    roots.splice(0).forEach((root) => rmSync(root, { recursive: true, force: true })),
  );

  it('preserves unrelated Codex content and task data through idempotency and removal', () => {
    const root = mkdtempSync(join(tmpdir(), 'relay-setup-workflow-'));
    roots.push(root);
    const databasePath = join(root, 'data', 'relay.db');
    const configPath = join(root, 'codex.toml');
    const before = '[profile]\nname = "workflow"\n';
    writeFileSync(configPath, before);
    const environment = {
      ...process.env,
      RELAY_DB_PATH: databasePath,
      APPDATA: join(root, 'appdata'),
      LOCALAPPDATA: join(root, 'localappdata'),
    };
    const run = (...args: readonly string[]): CliRun => {
      const result = spawnSync(
        process.execPath,
        [join(process.cwd(), 'dist/cli/main.js'), ...args],
        { cwd: root, env: environment, encoding: 'utf8' },
      );
      return { status: result.status, stdout: result.stdout ?? '', stderr: result.stderr ?? '' };
    };
    expect(run('setup').status).toBe(0);
    const capture = run(
      'task',
      'capture',
      '--title',
      'Before setup',
      '--agent',
      'test',
      '--session',
      'setup-session',
      '--output',
      'json',
    );
    expect(capture.status).toBe(0);
    const taskId = (JSON.parse(capture.stdout) as { data?: { task?: { id?: string } } }).data?.task
      ?.id;
    expect(taskId).toBeTruthy();
    expect(run('setup', '--client', 'codex', '--config-file', configPath, '--apply').status).toBe(
      0,
    );
    expect(readFileSync(configPath, 'utf8')).toContain('command = "relay"');
    const backup = run('setup', '--client', 'codex', '--config-file', configPath, '--apply');
    expect(backup.status).toBe(0);
    expect(backup.stdout).toContain('"changed":false');
    expect(
      run('config', 'disable', '--client', 'codex', '--config-file', configPath, '--apply').status,
    ).toBe(0);
    expect(run('setup', '--client', 'codex', '--config-file', configPath, '--apply').status).toBe(
      0,
    );
    expect(
      run('config', 'remove', '--client', 'codex', '--config-file', configPath, '--apply').status,
    ).toBe(0);
    expect(existsSync(databasePath)).toBe(true);
    expect(run('task', 'get', taskId!, '--output', 'json').stdout).toContain(taskId!);
  }, 15_000);

  it('returns a JSON storage error when the database path is unusable', () => {
    const root = mkdtempSync(join(tmpdir(), 'relay-setup-error-'));
    roots.push(root);
    const databasePath = join(root, 'database-dir');
    mkdirSync(databasePath);
    const result = spawnSync(process.execPath, [join(process.cwd(), 'dist/cli/main.js'), 'setup'], {
      cwd: root,
      env: {
        ...process.env,
        RELAY_DB_PATH: databasePath,
        APPDATA: join(root, 'appdata'),
        LOCALAPPDATA: join(root, 'localappdata'),
      },
      encoding: 'utf8',
    });
    expect(result.status).toBe(5);
    expect(JSON.parse(result.stdout) as { ok?: boolean }).toMatchObject({ ok: false });
    expect(result.stderr).toMatch(/database|path/i);
  });
});
