import { execFileSync } from 'node:child_process';
import { mkdirSync, mkdtempSync, readdirSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import { REQUIRED_PACKAGE_PATHS } from '../../scripts/package/package-files.js';
import {
  inspectTarball,
  normalizedTarballInventory,
  validatePackageInventory,
} from '../../scripts/package/inspect-tarball.js';

describe('Relay npm tarball', () => {
  it('rejects an unexpected file inside an otherwise published directory', () => {
    const inventory = [
      ...REQUIRED_PACKAGE_PATHS,
      'package/dist/web/assets/index-ABC123.js',
      'package/skills/relay-capture/private-notes.txt',
    ];

    expect(() => validatePackageInventory(inventory)).toThrowError(
      /Unexpected:\npackage\/skills\/relay-capture\/private-notes\.txt/,
    );
  });

  it('accepts only narrowly generated Vite assets', () => {
    const base = [...REQUIRED_PACKAGE_PATHS];

    expect(() =>
      validatePackageInventory([
        ...base,
        'package/dist/web/assets/index-ABC123.js',
        'package/dist/web/assets/index-ABC123.css',
      ]),
    ).not.toThrow();

    for (const unexpected of [
      'package/dist/web/assets/secrets.json',
      'package/dist/web/assets/nested/index-ABC123.js',
      'package/dist/web/debug.txt',
      'package/dist/cli/extra.js',
    ]) {
      expect(() =>
        validatePackageInventory([...base, 'package/dist/web/assets/index-ABC123.js', unexpected]),
      ).toThrowError(new RegExp(unexpected.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')));
    }
  });

  it('rejects missing required files separately from unexpected files', () => {
    const inventory = REQUIRED_PACKAGE_PATHS.filter(
      (path) => path !== 'package/assets/migrations/0004_task_normalized_title.sql',
    );

    expect(() => validatePackageInventory(inventory)).toThrowError(
      /Missing:\npackage\/assets\/migrations\/0004_task_normalized_title\.sql/,
    );
  });

  it('inspects the actual npm pack archive', async () => {
    const artifactRoot = mkdtempSync(join(tmpdir(), 'relay-npm-pack-'));
    mkdirSync(artifactRoot, { recursive: true });
    try {
      if (process.platform === 'win32') {
        execFileSync(process.env.ComSpec ?? 'cmd.exe', ['/d', '/s', '/c', 'pnpm build'], {
          cwd: process.cwd(),
          stdio: 'pipe',
        });
      } else {
        execFileSync('pnpm', ['build'], { cwd: process.cwd(), stdio: 'pipe' });
      }
      const packOutput =
        process.platform === 'win32'
          ? execFileSync(
              process.env.ComSpec ?? 'cmd.exe',
              ['/d', '/s', '/c', `npm pack --json --pack-destination ${artifactRoot}`],
              {
                cwd: process.cwd(),
                encoding: 'utf8',
                env: { ...process.env, npm_config_cache: join(artifactRoot, 'npm-cache') },
              },
            )
          : execFileSync('npm', ['pack', '--json', '--pack-destination', artifactRoot], {
              cwd: process.cwd(),
              encoding: 'utf8',
              env: { ...process.env, npm_config_cache: join(artifactRoot, 'npm-cache') },
            });
      const result = JSON.parse(packOutput) as Array<{ filename: string }>;
      const tarballPath = join(artifactRoot, result[0]?.filename ?? '');
      await inspectTarball(tarballPath);
      const inventory = normalizedTarballInventory(tarballPath);
      expect(inventory).toEqual([...inventory].sort());
      expect(readdirSync(artifactRoot).filter((entry) => entry.endsWith('.tgz'))).toEqual([
        result[0]?.filename,
      ]);
    } finally {
      rmSync(artifactRoot, { recursive: true, force: true });
    }
  }, 120_000);
});
