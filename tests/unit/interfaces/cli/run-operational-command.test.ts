import { existsSync, mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterEach, describe, expect, it } from 'vitest';
import { runOperationalCommand } from '../../../../src/interfaces/cli/run-operational-command.js';
import type { OperationalDependencies } from '../../../../src/interfaces/cli/run-operational-command.js';

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
});
