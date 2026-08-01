import { describe, it } from 'vitest';
import { verifyInstalledPackage } from '../../scripts/package/smoke-installed-package.js';

describe.skipIf(process.env.RELAY_RUN_PACKAGE_SMOKE !== '1')('installed Relay npm package', () => {
  it('executes from an isolated prefix and unrelated cwd', async () => {
    await verifyInstalledPackage();
  }, 300_000);
});
