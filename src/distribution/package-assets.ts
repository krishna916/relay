import { existsSync, readFileSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { RelayError } from '../shared/errors.js';

const RELAY_PACKAGE_NAMES = new Set(['@krishna916/relay', 'relay']);

export interface PackageAssets {
  readonly packageRoot: string;
  readonly migrationsDir: string;
  readonly webRoot: string;
  readonly skillsDir: string;
  readonly integrationsDir: string;
}

function findPackageRoot(startDirectory: string): string {
  let current = resolve(startDirectory);
  for (;;) {
    const packagePath = join(current, 'package.json');
    if (existsSync(packagePath)) {
      const parsed = JSON.parse(readFileSync(packagePath, 'utf8')) as { name?: string };
      if (parsed.name && RELAY_PACKAGE_NAMES.has(parsed.name)) return current;
    }
    const parent = dirname(current);
    if (parent === current) break;
    current = parent;
  }
  throw new RelayError(
    `Unable to locate the installed @krishna916/relay package (or MCPB relay package) from ${startDirectory}. Reinstall Relay and try again.`,
  );
}

export function resolvePackageAssets(moduleUrl = import.meta.url): PackageAssets {
  const modulePath = moduleUrl.startsWith('file:') ? fileURLToPath(moduleUrl) : moduleUrl;
  const packageRoot = findPackageRoot(dirname(modulePath));
  return {
    packageRoot,
    migrationsDir: join(packageRoot, 'assets', 'migrations'),
    webRoot: join(packageRoot, 'dist', 'web'),
    skillsDir: join(packageRoot, 'skills'),
    integrationsDir: join(packageRoot, 'integrations'),
  };
}

export function assertPackageAssetDirectories(assets: PackageAssets): void {
  for (const [label, path] of [
    ['migrations', assets.migrationsDir],
    ['web', assets.webRoot],
    ['skills', assets.skillsDir],
    ['integrations', assets.integrationsDir],
  ] as const) {
    if (!existsSync(path)) {
      throw new RelayError(
        `Installed Relay package is missing its ${label} assets at ${path}. Reinstall Relay and try again.`,
      );
    }
  }
}
