import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { describe, expect, it } from 'vitest';
import {
  countTopLevelKey,
  REQUIRED_ONLY_BUILT_DEPENDENCIES,
  REQUIRED_PNPM_OVERRIDES,
  verifyPackageMetadata,
} from '../../../../scripts/package/verify-package-metadata.js';

describe('countTopLevelKey', () => {
  it('counts one top-level key', () => {
    expect(countTopLevelKey('{"pnpm":{}}', 'pnpm')).toBe(1);
  });

  it('counts multiple top-level keys', () => {
    expect(countTopLevelKey('{"pnpm":{},"other":1,"pnpm":{}}', 'pnpm')).toBe(2);
  });

  it('does not count nested keys', () => {
    expect(countTopLevelKey('{"nested":{"pnpm":{}},"pnpm":{}}', 'pnpm')).toBe(1);
  });

  it('ignores escaped quotes in nearby string values', () => {
    const source = '{"description":"escaped \\"pnpm\\": value","pnpm":{}}';
    expect(countTopLevelKey(source, 'pnpm')).toBe(1);
  });
});

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
    expect(packageJson.publishConfig).toEqual({ access: 'public' });
    expect(packageJson.pnpm).toEqual({
      overrides: REQUIRED_PNPM_OVERRIDES,
      onlyBuiltDependencies: [...REQUIRED_ONLY_BUILT_DEPENDENCIES],
    });
  });

  it('validates root metadata and the lockfile contract', () => {
    expect(() => verifyPackageMetadata(resolve('.'))).not.toThrow();
  });
});
