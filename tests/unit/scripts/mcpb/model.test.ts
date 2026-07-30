import { mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import { afterEach, describe, expect, it } from 'vitest';
import {
  assertLinuxBuildTarget,
  assertRuntimeDependencyParity,
  createStagedManifest,
  createStagedRuntimePackage,
  readRelayPackageMetadata,
  resolveLinuxMcpbPaths,
  type McpbManifest,
  type RootPackage,
  type RuntimePackage,
} from '../../../../scripts/mcpb/model.js';

const sourceManifest: McpbManifest = {
  manifest_version: '0.3',
  name: 'relay',
  version: '0.0.0',
  server: {
    type: 'node',
    entry_point: 'server/main.js',
    mcp_config: { command: 'node', args: ['${__dirname}/server/main.js'], env: {} },
  },
};
const sourceRuntimePackage: RuntimePackage = {
  name: 'relay',
  version: '0.0.0',
  type: 'module',
  engines: { node: '>=0' },
  dependencies: {
    '@modelcontextprotocol/sdk': '1.29.0',
    'better-sqlite3': '13.0.1',
    zod: '4.4.3',
  },
};
const rootPackage: RootPackage = {
  dependencies: {
    '@modelcontextprotocol/sdk': '1.29.0',
    'better-sqlite3': '13.0.1',
    zod: '4.4.3',
  },
};

describe('Linux MCPB package model', () => {
  const temporaryDirectories: string[] = [];

  afterEach(() => {
    for (const directory of temporaryDirectories) {
      rmSync(directory, { recursive: true, force: true });
    }
    temporaryDirectories.splice(0, temporaryDirectories.length);
  });

  it('derives a versioned Linux artifact name from the actual architecture', () => {
    const rootDir = resolve('repo');
    const paths = resolveLinuxMcpbPaths(rootDir, 'x64', '0.1.0');
    expect(paths.stageDir).toBe(join(rootDir, '.mcpb', 'relay'));
    expect(paths.artifactPath).toBe(join(rootDir, 'artifacts', 'relay-0.1.0-linux-x64.mcpb'));
  });

  it('reads root package metadata from its supplied directory', () => {
    const rootDir = mkdtempSync(join(tmpdir(), 'relay-mcpb-model-'));
    temporaryDirectories.push(rootDir);
    writeFileSync(
      join(rootDir, 'package.json'),
      JSON.stringify({ name: 'relay', version: '0.1.0', engines: { node: '>=24 <25' } }),
    );

    expect(readRelayPackageMetadata(rootDir)).toEqual({
      name: 'relay',
      version: '0.1.0',
      nodeEngine: '>=24 <25',
    });
  });

  it('copies the root version and Node engine into staged metadata', () => {
    const relay = { name: 'relay', version: '0.1.0', nodeEngine: '>=24 <25' };

    expect(createStagedManifest(sourceManifest, relay)).toMatchObject({
      name: 'relay',
      version: '0.1.0',
      compatibility: { platforms: ['linux'], runtimes: { node: '>=24 <25' } },
    });
    expect(createStagedRuntimePackage(sourceRuntimePackage, relay)).toMatchObject({
      name: 'relay',
      version: '0.1.0',
      engines: { node: '>=24 <25' },
    });
  });

  it('rejects a non-Linux packaging target', () => {
    expect(() => assertLinuxBuildTarget('win32')).toThrow(
      'Linux MCPB construction requires process.platform === "linux".\nCurrent platform: win32.\nRun this command on a supported Linux environment.',
    );
  });

  it('rejects unsupported architectures', () => {
    expect(() => resolveLinuxMcpbPaths('/repo', 'ia32', '0.1.0')).toThrow(/Unsupported Linux MCPB architecture/);
  });

  it('rejects dependency drift and React runtime dependencies', () => {
    expect(() =>
      assertRuntimeDependencyParity(rootPackage, {
        ...sourceRuntimePackage,
        dependencies: { ...sourceRuntimePackage.dependencies, 'better-sqlite3': '13.0.0' },
      }),
    ).toThrow('MCPB runtime dependency better-sqlite3 must match the root resolved version 13.0.1.');
    expect(() =>
      assertRuntimeDependencyParity(rootPackage, {
        ...sourceRuntimePackage,
        dependencies: { ...sourceRuntimePackage.dependencies, react: '19.2.8' },
      }),
    ).toThrow(/must not include React/);
  });
});
