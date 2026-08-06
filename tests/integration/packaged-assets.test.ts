import {
  cpSync,
  existsSync,
  mkdirSync,
  mkdtempSync,
  readFileSync,
  rmSync,
  writeFileSync,
} from 'node:fs';
import { readFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import { stagePackageAssets } from '../../scripts/package/stage-package-assets.js';

describe('packaged immutable assets', () => {
  function createFixtureRoot(): string {
    const rootDir = mkdtempSync(join(tmpdir(), 'relay-package-assets-'));
    cpSync(
      join(process.cwd(), 'src', 'database', 'migrations'),
      join(rootDir, 'src', 'database', 'migrations'),
      { recursive: true },
    );
    writeFileSync(join(rootDir, 'package.json'), JSON.stringify({ version: '0.1.0' }));
    mkdirSync(join(rootDir, 'dist', 'web'), { recursive: true });
    writeFileSync(join(rootDir, 'dist', 'web', 'index.html'), '<!doctype html>');
    mkdirSync(join(rootDir, 'skills', 'relay-capture'), { recursive: true });
    writeFileSync(
      join(rootDir, 'skills', 'relay-capture', 'SKILL.md'),
      readFileSync(join(process.cwd(), 'skills', 'relay-capture', 'SKILL.md')),
    );
    mkdirSync(join(rootDir, 'integrations', 'generic-mcp'), { recursive: true });
    writeFileSync(join(rootDir, 'integrations', 'generic-mcp', 'README.md'), '# Generic MCP\n');
    writeFileSync(
      join(rootDir, 'integrations', 'generic-mcp', 'server-config.json.example'),
      JSON.stringify({ command: 'relay', args: ['mcp'] }),
    );
    mkdirSync(join(rootDir, 'assets'), { recursive: true });
    cpSync(
      join(process.cwd(), 'assets', 'compatibility.json'),
      join(rootDir, 'assets', 'compatibility.json'),
    );
    return rootDir;
  }

  it('stages canonical migrations without touching mutable runtime paths', async () => {
    const rootDir = createFixtureRoot();
    try {
      await stagePackageAssets({ rootDir });
      const staged = join(rootDir, 'assets', 'migrations', '0001_scaffold.sql');
      expect(existsSync(staged)).toBe(true);
      expect(await readFile(staged, 'utf8')).toBe(
        await readFile(
          join(process.cwd(), 'src', 'database', 'migrations', '0001_scaffold.sql'),
          'utf8',
        ),
      );
      expect(existsSync(join(rootDir, 'assets', 'relay.db'))).toBe(false);
    } finally {
      rmSync(rootDir, { recursive: true, force: true });
    }
  });

  it('rejects a package root missing compatibility.json during staging', async () => {
    const rootDir = createFixtureRoot();
    const compatibilityPath = join(rootDir, 'assets', 'compatibility.json');
    rmSync(compatibilityPath);
    try {
      await expect(stagePackageAssets({ rootDir })).rejects.toThrow(
        `Package asset is missing after build: ${compatibilityPath}`,
      );
    } finally {
      rmSync(rootDir, { recursive: true, force: true });
    }
  });

  it('rejects an invalid compatibility manifest during staging', async () => {
    const rootDir = createFixtureRoot();
    const compatibilityPath = join(rootDir, 'assets', 'compatibility.json');
    writeFileSync(compatibilityPath, JSON.stringify({ schemaVersion: 99 }));
    try {
      await expect(stagePackageAssets({ rootDir })).rejects.toThrow(
        'Package compatibility manifest is invalid or inconsistent.',
      );
    } finally {
      rmSync(rootDir, { recursive: true, force: true });
    }
  });
});
