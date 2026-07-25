import { existsSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { RelayError } from './errors.js';

const moduleDirectory = dirname(fileURLToPath(import.meta.url));

let cachedPackageRoot: string | null = null;

function findPackageRoot(startDirectory: string): string {
  let currentDirectory = resolve(startDirectory);

  for (;;) {
    if (existsSync(join(currentDirectory, 'package.json'))) {
      return currentDirectory;
    }

    const parentDirectory = dirname(currentDirectory);
    if (parentDirectory === currentDirectory) {
      throw new RelayError(`Unable to locate package root from ${startDirectory}.`);
    }

    currentDirectory = parentDirectory;
  }
}

export function getPackageRoot(): string {
  cachedPackageRoot ??= findPackageRoot(moduleDirectory);
  return cachedPackageRoot;
}

export function resolveFromPackageRoot(...segments: string[]): string {
  return join(getPackageRoot(), ...segments);
}
