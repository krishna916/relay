import { describe, it, expect } from 'vitest';
import { getPackageMetadata } from '../../../src/shared/package-metadata.js';

describe('package-metadata', () => {
  it('returns package name and version', () => {
    const meta = getPackageMetadata();
    expect(meta.name).toBe('relay');
    expect(meta.version).toMatch(/^\d+\.\d+\.\d+/);
  });
});
