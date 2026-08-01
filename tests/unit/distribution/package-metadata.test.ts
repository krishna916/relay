import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { describe, expect, it } from 'vitest';
import {
  REQUIRED_ONLY_BUILT_DEPENDENCIES,
  REQUIRED_PNPM_OVERRIDES,
  verifyPackageMetadata,
} from '../../../scripts/package/verify-package-metadata.js';

describe('publishable package metadata', () => {
  it('declares the public package and one stable executable', () => {
    const packageJson = JSON.parse(readFileSync(resolve('package.json'), 'utf8')) as Record<
      string,
      unknown
    >;

    expect(packageJson.name).toBe('@krishna916/relay');
    expect(packageJson.private).toBeUndefined();
    expect(packageJson.version).toMatch(/^\d+\.\d+\.\d+$/);
    expect(packageJson.engines).toEqual({ node: '>=24 <25' });
    expect(packageJson.bin).toEqual({ relay: './dist/cli/main.js' });
    expect(packageJson.pnpm).toEqual({
      overrides: REQUIRED_PNPM_OVERRIDES,
      onlyBuiltDependencies: [...REQUIRED_ONLY_BUILT_DEPENDENCIES],
    });
  });

  it('validates root metadata and the lockfile contract', () => {
    expect(() => verifyPackageMetadata(resolve('.'))).not.toThrow();
  });
});
