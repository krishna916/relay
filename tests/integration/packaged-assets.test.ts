import { cpSync, existsSync, mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { readFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import { stagePackageAssets } from '../../scripts/package/stage-package-assets.js';

describe('packaged immutable assets', () => {
  it('stages canonical migrations without touching mutable runtime paths', async () => {
    const rootDir = mkdtempSync(join(tmpdir(), 'relay-package-assets-'));
    try {
      cpSync(
        join(process.cwd(), 'src', 'database', 'migrations'),
        join(rootDir, 'src', 'database', 'migrations'),
        { recursive: true },
      );
      mkdirSync(join(rootDir, 'dist', 'web'), { recursive: true });
      writeFileSync(join(rootDir, 'dist', 'web', 'index.html'), '<!doctype html>');
      mkdirSync(join(rootDir, 'skills', 'relay-capture'), { recursive: true });
      writeFileSync(join(rootDir, 'skills', 'relay-capture', 'SKILL.md'), '# Relay Capture\n');
      mkdirSync(join(rootDir, 'integrations', 'generic-mcp'), { recursive: true });
      writeFileSync(join(rootDir, 'integrations', 'generic-mcp', 'README.md'), '# Generic MCP\n');

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
});
