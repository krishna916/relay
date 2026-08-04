import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { expect, it } from 'vitest';
import { readExpectedPackageVersion } from '../../scripts/package/smoke-installed-package.js';

it('derives the expected smoke version from package metadata', () => {
  const root = mkdtempSync(join(tmpdir(), 'relay-version-fixture-'));
  try {
    mkdirSync(root, { recursive: true });
    writeFileSync(
      join(root, 'package.json'),
      JSON.stringify({ name: '@krishna916/relay', version: '9.8.7' }),
      'utf8',
    );

    expect(readExpectedPackageVersion(root)).toBe('9.8.7');
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
});
