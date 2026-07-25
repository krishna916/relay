import { readFileSync } from 'node:fs';
import { join } from 'node:path';

export interface PackageMetadata {
  readonly name: string;
  readonly version: string;
}

let cachedMetadata: PackageMetadata | null = null;

export function getPackageMetadata(): PackageMetadata {
  if (cachedMetadata) return cachedMetadata;

  const pkgPath = join(process.cwd(), 'package.json');
  const content = readFileSync(pkgPath, 'utf-8');
  const parsed = JSON.parse(content) as { name: string; version: string };

  cachedMetadata = {
    name: parsed.name,
    version: parsed.version,
  };
  return cachedMetadata;
}
