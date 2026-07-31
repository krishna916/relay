import { mkdir, readFile, readdir, writeFile } from 'node:fs/promises';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import { mkdtemp } from 'node:fs/promises';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { stageLinuxMcpb } from '../../../../scripts/mcpb/stage-linux-mcpb.js';

const roots: string[] = [];

async function fixtureRoot(): Promise<string> {
  const rootDir = await mkdtemp(join(tmpdir(), 'relay-mcpb-stage-'));
  roots.push(rootDir);
  await Promise.all([
    mkdir(join(rootDir, 'dist/mcp'), { recursive: true }),
    mkdir(join(rootDir, 'src/database/migrations'), { recursive: true }),
    mkdir(join(rootDir, 'integrations/claude-desktop'), { recursive: true }),
  ]);
  await Promise.all([
    writeFile(
      join(rootDir, 'package.json'),
      JSON.stringify({
        name: 'relay',
        version: '0.1.0',
        engines: { node: '>=24 <25' },
        dependencies: {
          '@modelcontextprotocol/sdk': '1.29.0',
          'better-sqlite3': '13.0.1',
          zod: '4.4.3',
        },
      }),
    ),
    writeFile(
      join(rootDir, 'pnpm-lock.yaml'),
      "importers:\n\n  .:\n    dependencies:\n      '@modelcontextprotocol/sdk':\n        specifier: ^1.29.0\n        version: 1.29.0\n      better-sqlite3:\n        specifier: ^13.0.1\n        version: 13.0.1\n      zod:\n        specifier: ^4.4.3\n        version: 4.4.3\npackages:\n",
    ),
    writeFile(join(rootDir, 'dist/mcp/main.js'), 'process.exit(0);'),
    writeFile(join(rootDir, 'dist/chunk-runtime.js'), 'export const runtime = true;'),
    writeFile(join(rootDir, 'src/database/migrations/0001_create_tasks.sql'), 'select 1;'),
    writeFile(
      join(rootDir, 'integrations/claude-desktop/manifest.json'),
      JSON.stringify({
        manifest_version: '0.3',
        name: 'relay',
        version: '0.1.0',
        server: {
          type: 'node',
          entry_point: 'server/main.js',
          mcp_config: { command: 'node', args: ['${__dirname}/server/main.js'], env: {} },
        },
      }),
    ),
    writeFile(
      join(rootDir, 'integrations/claude-desktop/package.json'),
      JSON.stringify({
        name: 'relay',
        version: '0.1.0',
        type: 'module',
        engines: { node: '>=24 <25' },
        dependencies: {
          '@modelcontextprotocol/sdk': '1.29.0',
          'better-sqlite3': '13.0.1',
          zod: '4.4.3',
        },
      }),
    ),
    writeFile(
      join(rootDir, 'integrations/claude-desktop/pnpm-lock.yaml'),
      'lockfileVersion: "9.0"\n',
    ),
    writeFile(join(rootDir, 'integrations/claude-desktop/.mcpbignore'), '*.db\n'),
    writeFile(join(rootDir, 'integrations/claude-desktop/NOTICE.md'), '# notice\n'),
  ]);
  return rootDir;
}

afterEach(async () => {
  await Promise.all(
    roots
      .splice(0)
      .map(async (root) =>
        (await import('node:fs/promises')).rm(root, { recursive: true, force: true }),
      ),
  );
});

describe('stageLinuxMcpb', () => {
  it('creates the approved staging inventory with a hoisted dependency installation', async () => {
    const rootDir = await fixtureRoot();
    const runCommand = vi.fn(async () => undefined);
    const result = await stageLinuxMcpb({ rootDir, platform: 'linux', arch: 'x64', runCommand });
    const files = await readdir(result.stageDir, { recursive: true });

    expect(files).toEqual(
      expect.arrayContaining([
        'manifest.json',
        'package.json',
        'pnpm-lock.yaml',
        '.mcpbignore',
        'NOTICE.md',
        'server',
        'src',
      ]),
    );
    expect(await readFile(join(result.stageDir, 'server/main.js'), 'utf8')).toContain(
      'process.exit',
    );
    expect(await readFile(join(result.stageDir, 'chunk-runtime.js'), 'utf8')).toContain('runtime');
    expect(runCommand).toHaveBeenCalledWith(
      'pnpm',
      [
        'install',
        '--prod',
        '--frozen-lockfile',
        '--ignore-workspace',
        '--config.node-linker=hoisted',
      ],
      expect.objectContaining({ cwd: result.stageDir }),
    );
  });

  it('cleans stale staging content without touching artifacts', async () => {
    const rootDir = await fixtureRoot();
    await mkdir(join(rootDir, '.mcpb/relay'), { recursive: true });
    await mkdir(join(rootDir, 'artifacts'), { recursive: true });
    await Promise.all([
      writeFile(join(rootDir, '.mcpb/relay/stale.txt'), 'stale'),
      writeFile(join(rootDir, 'artifacts/keep.txt'), 'keep'),
    ]);
    await stageLinuxMcpb({
      rootDir,
      platform: 'linux',
      arch: 'x64',
      runCommand: async () => undefined,
    });

    await expect(readFile(join(rootDir, '.mcpb/relay/stale.txt'))).rejects.toThrow();
    await expect(readFile(join(rootDir, 'artifacts/keep.txt'), 'utf8')).resolves.toBe('keep');
  });

  it('rejects non-Linux targets before mutation', async () => {
    const rootDir = await fixtureRoot();
    await expect(stageLinuxMcpb({ rootDir, platform: 'win32' })).rejects.toThrow(
      /Current platform: win32/,
    );
  });
});
