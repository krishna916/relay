import { describe, expect, it } from 'vitest';
import { createPackageAssetsCheck } from '../../../../src/distribution/doctor/check-package-assets.js';
import type { PackageAssets } from '../../../../src/distribution/package-assets.js';
import type { PathLike } from 'node:fs';
import type { realpath as realpathFunction } from 'node:fs/promises';
import { join, resolve } from 'node:path';

const fixtureRoot = resolve('tmp', 'relay-package');
const executablePath = join(fixtureRoot, 'dist', 'cli', 'main.js');
const outsidePath = resolve('tmp', 'outside', 'web');
const assets: PackageAssets = {
  packageRoot: fixtureRoot,
  migrationsDir: join(fixtureRoot, 'assets', 'migrations'),
  webRoot: join(fixtureRoot, 'dist', 'web'),
  skillsDir: join(fixtureRoot, 'skills'),
  integrationsDir: join(fixtureRoot, 'integrations'),
};

describe('doctor package asset check', () => {
  it('reports all executable and immutable assets as healthy', async () => {
    const result = await createPackageAssetsCheck({
      executablePath,
      assets,
      access: async () => undefined,
      realpath: (async (path: PathLike) => path.toString()) as unknown as typeof realpathFunction,
    }).run();
    expect(result).toMatchObject({ status: 'healthy', code: 'package.assets.available' });
  });

  it('reports the approved missing asset label without leaking an engine error', async () => {
    const result = await createPackageAssetsCheck({
      executablePath,
      assets,
      access: async (path) => {
        if (path === assets.webRoot) throw new Error('raw filesystem details');
      },
      realpath: (async (path: PathLike) => path.toString()) as unknown as typeof realpathFunction,
    }).run();
    expect(result).toMatchObject({
      status: 'failure',
      code: 'package.assets.missing',
      message: 'An immutable Relay package asset is missing or unreadable.',
    });
    expect(JSON.stringify(result)).not.toContain('raw filesystem details');
  });

  it('fails when an asset resolves outside the package root', async () => {
    const result = await createPackageAssetsCheck({
      executablePath,
      assets,
      access: async () => undefined,
      realpath: (async (path: PathLike) =>
        path.toString() === assets.webRoot
          ? outsidePath
          : path.toString()) as unknown as typeof realpathFunction,
    }).run();
    expect(result).toMatchObject({ status: 'failure', code: 'package.assets.outside-root' });
  });
});
