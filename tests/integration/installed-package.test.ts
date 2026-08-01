import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import {
  readExpectedPackageVersion,
  verifyInstalledPackage,
} from '../../scripts/package/smoke-installed-package.js';

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

describe.skipIf(process.env.RELAY_RUN_PACKAGE_SMOKE !== '1')('installed Relay npm package', () => {
  it('executes from an isolated prefix and unrelated cwd', async () => {
    await verifyInstalledPackage();
  }, 300_000);
});
