import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { pathToFileURL } from 'node:url';
import { afterEach, describe, expect, it } from 'vitest';
import { readPackageVersion } from '../../../src/distribution/package-version.js';
import { resolvePackageAssets } from '../../../src/distribution/package-assets.js';

describe('packaged immutable assets', () => {
  const temporaryRoots: string[] = [];
  afterEach(() => {
    for (const root of temporaryRoots) rmSync(root, { recursive: true, force: true });
    temporaryRoots.length = 0;
  });

  it('walks from a module URL to the named package root independently of cwd', () => {
    const fixtureRoot = join(process.cwd(), 'tests', 'fixtures', 'package-root');
    const originalCwd = process.cwd();
    const unrelated = mkdtempSync(join(tmpdir(), 'relay-unrelated-'));
    temporaryRoots.push(unrelated);
    process.chdir(unrelated);
    try {
      const assets = resolvePackageAssets(
        pathToFileURL(join(fixtureRoot, 'dist', 'cli', 'main.js')).href,
      );
      expect(assets.packageRoot).toBe(fixtureRoot);
      expect(assets.migrationsDir).toBe(join(fixtureRoot, 'assets', 'migrations'));
      expect(assets.webRoot).toBe(join(fixtureRoot, 'dist', 'web'));
      expect(assets.skillsDir).toBe(join(fixtureRoot, 'skills'));
      expect(assets.integrationsDir).toBe(join(fixtureRoot, 'integrations'));
      expect(assets.packageRoot).not.toContain(unrelated);
      expect(readPackageVersion(assets)).toBe('9.8.7');
    } finally {
      process.chdir(originalCwd);
    }
  });

  it('rejects an entry that is not inside a named Relay package', () => {
    const root = mkdtempSync(join(tmpdir(), 'relay-missing-assets-'));
    temporaryRoots.push(root);
    mkdirSync(join(root, 'nested'), { recursive: true });
    writeFileSync(
      join(root, 'package.json'),
      JSON.stringify({ name: 'not-relay', version: '1.0.0' }),
    );
    expect(() => resolvePackageAssets(pathToFileURL(join(root, 'nested', 'main.js')).href)).toThrow(
      /@krishna916\/relay.*reinstall/i,
    );
  });

  it('accepts the relay identity used by staged MCPB runtimes', () => {
    const root = mkdtempSync(join(tmpdir(), 'relay-mcpb-assets-'));
    temporaryRoots.push(root);
    mkdirSync(join(root, 'server'), { recursive: true });
    writeFileSync(join(root, 'package.json'), JSON.stringify({ name: 'relay', version: '1.0.0' }));

    expect(
      resolvePackageAssets(pathToFileURL(join(root, 'server', 'main.js')).href).packageRoot,
    ).toBe(root);
  });

  it('fails with an actionable message when package metadata is invalid', () => {
    const root = mkdtempSync(join(tmpdir(), 'relay-invalid-version-'));
    temporaryRoots.push(root);
    writeFileSync(
      join(root, 'package.json'),
      JSON.stringify({ name: '@krishna916/relay', version: 'dev' }),
    );
    expect(() =>
      readPackageVersion(resolvePackageAssets(pathToFileURL(join(root, 'main.js')).href)),
    ).toThrow(/invalid version.*reinstall/i);
  });
});
