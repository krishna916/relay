import { existsSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterEach, describe, expect, it } from 'vitest';
import { runOperationalCommand } from '../../../../src/interfaces/cli/run-operational-command.js';
import type { OperationalDependencies } from '../../../../src/interfaces/cli/run-operational-command.js';
import { writeIntegrationTransactionJournal } from '../../../../src/distribution/setup/integration-transaction-journal.js';
import { fingerprint } from '../../../../src/distribution/setup/plan-integration-change.js';

function createDependencies(root: string, output: string[]): OperationalDependencies {
  return {
    runtimePaths: {
      dataRoot: join(root, 'data'),
      configRoot: join(root, 'config'),
      cacheRoot: join(root, 'cache'),
      databasePath: join(root, 'data', 'relay.db'),
    },
    openRuntime: () => ({ close: () => undefined }),
    applicationVersion: '0.1.0',
    stdout: {
      write: (text) => {
        output.push(text);
      },
    },
    stderr: { write: () => undefined },
  };
}

describe('runOperationalCommand', () => {
  const roots: string[] = [];
  afterEach(() =>
    roots.splice(0).forEach((root) => rmSync(root, { recursive: true, force: true })),
  );

  it('initializes before previewing a mutable client and does not write the client', async () => {
    const root = mkdtempSync(join(tmpdir(), 'relay-operational-'));
    roots.push(root);
    const output: string[] = [];
    const configPath = join(root, 'codex.toml');
    const code = await runOperationalCommand(
      ['setup', '--client', 'codex', '--config-file', configPath],
      createDependencies(root, output),
    );
    expect(code).toBe(0);
    expect(existsSync(join(root, 'config', 'config.json'))).toBe(false);
    expect(output).toHaveLength(1);
    expect(JSON.parse(output[0] ?? '{}').data.snippet).toContain('command = "relay"');
  });

  it('reports effective paths without opening client configuration files', async () => {
    const root = mkdtempSync(join(tmpdir(), 'relay-operational-'));
    roots.push(root);
    const output: string[] = [];
    const code = await runOperationalCommand(['config', 'paths'], createDependencies(root, output));
    expect(code).toBe(0);
    expect(output).toHaveLength(1);
    expect(JSON.parse(output[0] ?? '{}').data.paths.metadataPath).toContain('config.json');
  });

  it('reports both requested roots when their shared parent is created', async () => {
    const root = mkdtempSync(join(tmpdir(), 'relay-operational-'));
    roots.push(root);
    const output: string[] = [];
    const dataRoot = join(root, 'shared', 'data');
    const configRoot = join(root, 'shared', 'config');
    const code = await runOperationalCommand(['setup'], {
      runtimePaths: {
        dataRoot,
        configRoot,
        cacheRoot: join(root, 'cache'),
        databasePath: join(dataRoot, 'relay.db'),
      },
      openRuntime: () => ({ close: () => undefined }),
      applicationVersion: '0.1.0',
      stdout: {
        write: (text) => {
          output.push(text);
        },
      },
      stderr: { write: () => undefined },
    });

    expect(code).toBe(0);
    expect(JSON.parse(output[0] ?? '{}').data.createdDirectories).toEqual([dataRoot, configRoot]);
  });

  it('recovers an interrupted transaction before replanning setup', async () => {
    const root = mkdtempSync(join(tmpdir(), 'relay-operational-'));
    roots.push(root);
    const output: string[] = [];
    const configPath = join(root, 'codex.toml');
    const nextContent = '[mcp_servers.relay]\ncommand = "relay"\nargs = ["mcp"]\n';
    writeFileSync(configPath, nextContent);
    await writeIntegrationTransactionJournal(`${configPath}.relay-transaction.json`, {
      schemaVersion: 1,
      client: 'codex',
      configPath,
      entryId: 'relay',
      action: 'setup',
      phase: 'client-written',
      beforeFingerprint: fingerprint(''),
      nextFingerprint: fingerprint(nextContent),
      originalExisted: false,
      originalMode: 0o600,
      applicationVersion: '0.1.0',
      startedAt: '2026-08-02T01:02:03.004Z',
    });

    const code = await runOperationalCommand(
      ['setup', '--client', 'codex', '--config-file', configPath, '--apply'],
      createDependencies(root, output),
    );

    expect(code).toBe(0);
    expect(readFileSync(configPath, 'utf8')).toContain('command = "relay"');
    expect(existsSync(`${configPath}.relay-transaction.json`)).toBe(false);
    expect(JSON.parse(output.at(-1) ?? '{}').data.operation).toBe('created');
    expect(JSON.parse(output.at(-1) ?? '{}').data.recovery).toBe('rolled-back');
  });
});
