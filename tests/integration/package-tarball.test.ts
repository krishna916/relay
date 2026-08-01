import { execFileSync } from 'node:child_process';
import { mkdirSync, mkdtempSync, readdirSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import {
  inspectTarball,
  normalizedTarballInventory,
} from '../../scripts/package/inspect-tarball.js';

describe('Relay npm tarball', () => {
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
