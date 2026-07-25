import { mkdtempSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { getPackageMetadata } from '../../../src/shared/package-metadata.js';

describe('package-metadata', () => {
  const originalCwd = process.cwd();

  afterEach(() => {
    process.chdir(originalCwd);
  });

  it('returns package name and version', () => {
    const meta = getPackageMetadata();
    expect(meta.name).toBe('relay');
    expect(meta.version).toMatch(/^\d+\.\d+\.\d+/);
  });

  it('loads package metadata when invoked outside the repository working directory', () => {
    const tempDir = mkdtempSync(join(tmpdir(), 'relay-package-meta-'));
    process.chdir(tempDir);

    vi.resetModules();

    return import('../../../src/shared/package-metadata.js').then(({ getPackageMetadata }) => {
      const meta = getPackageMetadata();

      expect(meta).toEqual({
        name: 'relay',
        version: '0.1.0',
      });
    });
  });
});
