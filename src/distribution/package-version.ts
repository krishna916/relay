import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { RelayError } from '../shared/errors.js';
import { resolvePackageAssets, type PackageAssets } from './package-assets.js';

const cachedVersions = new Map<string, string>();

export function readPackageVersion(assets: PackageAssets = resolvePackageAssets()): string {
  const cachedVersion = cachedVersions.get(assets.packageRoot);
  if (cachedVersion !== undefined) return cachedVersion;
  const packagePath = join(assets.packageRoot, 'package.json');
  const packageJson = JSON.parse(readFileSync(packagePath, 'utf8')) as { version?: string };
  if (!/^(?:0|[1-9]\d*)\.(?:0|[1-9]\d*)\.(?:0|[1-9]\d*)$/.test(packageJson.version ?? '')) {
    throw new RelayError(
      `Installed Relay package has an invalid version in ${packagePath}. Reinstall Relay and try again.`,
    );
  }
  const version = packageJson.version;
  if (version === undefined)
    throw new RelayError(
      `Installed Relay package has no version in ${packagePath}. Reinstall Relay and try again.`,
    );
  cachedVersions.set(assets.packageRoot, version);
  return version;
}
