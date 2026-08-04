import { constants } from 'node:fs';
import { isAbsolute, relative } from 'node:path';
import type { access, realpath } from 'node:fs/promises';
import type { PackageAssets } from '../package-assets.js';
import type { DoctorCheck } from './doctor-types.js';

export function createPackageAssetsCheck(input: {
  readonly executablePath: string;
  readonly assets: PackageAssets;
  readonly access: typeof access;
  readonly realpath: typeof realpath;
}): DoctorCheck {
  const paths = [
    ['executable', input.executablePath],
    ['packageRoot', input.assets.packageRoot],
    ['migrations', input.assets.migrationsDir],
    ['web', input.assets.webRoot],
    ['skills', input.assets.skillsDir],
    ['integrations', input.assets.integrationsDir],
  ] as const;
  return {
    id: 'package.assets',
    run: async () => {
      try {
        const packageRoot = await input.realpath(input.assets.packageRoot);
        const resolved = await Promise.all(
          paths.map(async ([label, path]) => {
            await input.access(path, constants.R_OK);
            const realPath = await input.realpath(path);
            if (!isWithin(packageRoot, realPath)) throw new AssetBoundaryError();
            return [label, realPath] as const;
          }),
        );
        return {
          status: 'healthy',
          code: 'package.assets.available',
          message: 'The installed Relay executable and immutable assets are available.',
          details: Object.fromEntries(resolved),
        };
      } catch (error) {
        if (error instanceof AssetBoundaryError) {
          return {
            status: 'failure',
            code: 'package.assets.outside-root',
            message: 'An immutable Relay package asset resolves outside the package root.',
          };
        }
        return {
          status: 'failure',
          code: 'package.assets.missing',
          message: 'An immutable Relay package asset is missing or unreadable.',
        };
      }
    },
  };
}

function isWithin(root: string, target: string): boolean {
  const path = relative(root, target);
  return path === '' || (!path.startsWith('..') && !isAbsolute(path));
}

class AssetBoundaryError extends Error {}
