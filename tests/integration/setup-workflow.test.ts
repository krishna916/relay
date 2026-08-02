import {
  existsSync,
  mkdirSync,
  mkdtempSync,
  readFileSync,
  readdirSync,
  rmSync,
  unlinkSync,
  writeFileSync,
} from 'node:fs';
import { spawnSync } from 'node:child_process';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { pathToFileURL } from 'node:url';
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

  it('recovers a cross-process transaction interrupted after client write', () => {
    const root = mkdtempSync(join(tmpdir(), 'relay-setup-crash-recovery-'));
    roots.push(root);
    const configPath = join(root, 'codex.toml');
    const journalPath = `${configPath}.relay-transaction.json`;
    const lockPath = `${configPath}.relay-lock`;
    const original = '[profile]\nname = "before crash"\n';
    writeFileSync(configPath, original);
    const caseData = JSON.stringify({ root, configPath, journalPath, lockPath });
    const adapterModule = pathToFileURL(
      join(process.cwd(), 'src/distribution/setup/clients/codex-toml-adapter.ts'),
    ).href;
    const atomicWriteModule = pathToFileURL(
      join(process.cwd(), 'src/distribution/setup/backup-and-atomic-write.ts'),
    ).href;
    const journalModule = pathToFileURL(
      join(process.cwd(), 'src/distribution/setup/integration-transaction-journal.ts'),
    ).href;
    const lockModule = pathToFileURL(
      join(process.cwd(), 'src/distribution/setup/file-lock.ts'),
    ).href;
    const planModule = pathToFileURL(
      join(process.cwd(), 'src/distribution/setup/plan-integration-change.ts'),
    ).href;
    const crashScript = `
      import { createCodexTomlAdapter } from ${JSON.stringify(adapterModule)};
      import { backupAndAtomicWrite } from ${JSON.stringify(atomicWriteModule)};
      import { writeIntegrationTransactionJournal } from ${JSON.stringify(journalModule)};
      import { withExclusiveFileLock } from ${JSON.stringify(lockModule)};
      import { fingerprint } from ${JSON.stringify(planModule)};
      const value = JSON.parse(process.env.RELAY_TRANSACTION_CASE);
      const adapter = createCodexTomlAdapter();
      const before = ${JSON.stringify(original)};
      const next = adapter.upsertRelayEntry(before);
      await withExclusiveFileLock(value.lockPath, async () => {
        let prepared;
        const backup = await backupAndAtomicWrite({
          targetPath: value.configPath,
          expectedFingerprint: fingerprint(before),
          nextContent: next,
          validate: (content) => adapter.parse(content),
          now: new Date('2026-08-02T01:02:03.004Z'),
          beforeReplace: async (result) => {
            prepared = {
              schemaVersion: 1,
              client: 'codex',
              configPath: value.configPath,
              entryId: 'relay',
              action: 'setup',
              phase: 'prepared',
              beforeFingerprint: fingerprint(before),
              nextFingerprint: fingerprint(next),
              originalExisted: result.originalExisted,
              originalMode: result.originalMode,
              ...(result.backupPath === undefined ? {} : { backupPath: result.backupPath }),
              applicationVersion: '0.1.0',
              startedAt: '2026-08-02T01:02:03.004Z',
            };
            await writeIntegrationTransactionJournal(value.journalPath, prepared);
          },
        });
        await writeIntegrationTransactionJournal(value.journalPath, { ...prepared, phase: 'client-written' });
        process.exit(0);
      });
    `;
    const crashed = spawnSync(
      process.execPath,
      ['--import', 'tsx/esm', '--input-type=module', '--eval', crashScript],
      {
        cwd: process.cwd(),
        env: { ...process.env, RELAY_TRANSACTION_CASE: caseData },
        encoding: 'utf8',
        timeout: 30_000,
      },
    );
    expect(crashed.status).toBe(0);
    expect(existsSync(lockPath)).toBe(true);
    expect(existsSync(journalPath)).toBe(true);
    expect(readFileSync(configPath, 'utf8')).toContain('command = "relay"');

    unlinkSync(lockPath);

    const runModule = pathToFileURL(
      join(process.cwd(), 'src/interfaces/cli/run-operational-command.ts'),
    ).href;
    const recoveryScript = `
      import { runOperationalCommand } from ${JSON.stringify(runModule)};
      const value = JSON.parse(process.env.RELAY_TRANSACTION_CASE);
      const output = [];
      const code = await runOperationalCommand(
        ['setup', '--client', 'codex', '--config-file', value.configPath, '--apply'],
        {
          runtimePaths: {
            dataRoot: value.root + '/data',
            configRoot: value.root + '/config',
            cacheRoot: value.root + '/cache',
            databasePath: value.root + '/data/relay.db',
          },
          openRuntime: () => ({ close: () => undefined }),
          applicationVersion: '0.1.0',
          stdout: { write: (text) => output.push(text) },
          stderr: { write: () => undefined },
        },
      );
      process.stdout.write(JSON.stringify({ code, output }));
    `;
    const recovered = spawnSync(
      process.execPath,
      ['--import', 'tsx/esm', '--input-type=module', '--eval', recoveryScript],
      {
        cwd: process.cwd(),
        env: { ...process.env, RELAY_TRANSACTION_CASE: caseData },
        encoding: 'utf8',
        timeout: 30_000,
      },
    );
    expect(recovered.status).toBe(0);
    const result = JSON.parse(recovered.stdout) as { code: number; output: string[] };
    expect(result.code).toBe(0);
    expect(readFileSync(configPath, 'utf8')).toContain('command = "relay"');
    expect(existsSync(journalPath)).toBe(false);
    const ownership = JSON.parse(readFileSync(join(root, 'config', 'config.json'), 'utf8')) as {
      integrations: Array<{ client: string; configPath: string; status: string }>;
    };
    expect(ownership.integrations).toEqual([
      expect.objectContaining({ client: 'codex', configPath, status: 'enabled' }),
    ]);
    const backups = readdirSync(root).filter((name) => name.includes('.relay-backup-'));
    expect(backups.length).toBeGreaterThanOrEqual(2);
    expect(backups.map((name) => readFileSync(join(root, name), 'utf8'))).toContain(original);
  });
});
