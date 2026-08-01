import { resolvePackageAssets } from '../distribution/package-assets.js';
import { readPackageVersion } from '../distribution/package-version.js';

export interface PackageMetadata {
  readonly name: string;
  readonly version: string;
}

let cachedMetadata: PackageMetadata | null = null;

export function getPackageMetadata(): PackageMetadata {
  if (cachedMetadata) return cachedMetadata;

  const assets = resolvePackageAssets();

  cachedMetadata = {
    // Protocol and health contracts retain the application name relay;
    // npm publication identity is validated separately as @krishna916/relay.
    name: 'relay',
    version: readPackageVersion(assets),
  };
  return cachedMetadata;
}
