import { gunzipSync } from 'node:zlib';
import { readFileSync, readdirSync } from 'node:fs';
import { join } from 'node:path';
import { pathToFileURL } from 'node:url';
import {
  APPROVED_GENERATED_PACKAGE_PATTERNS,
  isApprovedPackagePath,
  REQUIRED_PACKAGE_PATHS,
} from './package-files.js';

function readTarEntries(tarballPath: string): string[] {
  const archive = gunzipSync(readFileSync(tarballPath));
  const entries: string[] = [];
  for (let offset = 0; offset + 512 <= archive.length;) {
    const header = archive.subarray(offset, offset + 512);
    if (header.every((byte) => byte === 0)) break;
    const name = header.subarray(0, 100).toString('utf8').replace(/\0.*$/, '');
    const prefix = header.subarray(345, 500).toString('utf8').replace(/\0.*$/, '');
    const sizeText = header.subarray(124, 136).toString('ascii').replace(/\0.*$/, '').trim();
    const size = sizeText ? parseInt(sizeText, 8) : 0;
    if (name) entries.push(prefix ? `${prefix}/${name}` : name);
    offset += 512 + Math.ceil(size / 512) * 512;
  }
  return [...new Set(entries)].sort();
}

export function normalizedTarballInventory(tarballPath: string): readonly string[] {
  return readTarEntries(tarballPath);
}

export function validatePackageInventory(entries: readonly string[]): void {
  const missing = REQUIRED_PACKAGE_PATHS.filter((path) => !entries.includes(path));
  const unexpected = entries.filter((path) => !isApprovedPackagePath(path));
  const generatedWebAssets = entries.filter((path) =>
    APPROVED_GENERATED_PACKAGE_PATTERNS.some((pattern) => pattern.test(path)),
  );

  if (generatedWebAssets.length === 0) {
    missing.push('package/dist/web/assets/<generated-runtime-asset>');
  }

  if (missing.length > 0 || unexpected.length > 0) {
    throw new Error(
      `Relay npm tarball inventory mismatch.\nMissing:\n${missing.join('\n') || '(none)'}\nUnexpected:\n${unexpected.join('\n') || '(none)'}`,
    );
  }
}

export async function inspectTarball(tarballPath: string): Promise<void> {
  validatePackageInventory(normalizedTarballInventory(tarballPath));
}

if (import.meta.url === pathToFileURL(process.argv[1] ?? '').href) {
  const defaultArtifactDir = join(process.cwd(), '.artifacts', 'npm');
  const defaultTarball = readdirSync(defaultArtifactDir)
    .filter((name) => name.endsWith('.tgz'))
    .sort()
    .at(-1);
  const tarballPath =
    process.argv[2] ??
    (defaultTarball === undefined ? undefined : join(defaultArtifactDir, defaultTarball));
  if (!tarballPath) {
    process.stderr.write('Usage: inspect-tarball.ts <tarball-path>\n');
    process.exitCode = 2;
  } else {
    inspectTarball(tarballPath)
      .then(() => process.stdout.write(`${normalizedTarballInventory(tarballPath).join('\n')}\n`))
      .catch((error: unknown) => {
        process.stderr.write(`${error instanceof Error ? error.message : String(error)}\n`);
        process.exitCode = 1;
      });
  }
}
