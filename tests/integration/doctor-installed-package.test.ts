import { describe, expect, it } from 'vitest';
import { DOCTOR_CHECK_ORDER } from '../../src/distribution/doctor/doctor-types.js';
import { verifyInstalledPackage } from '../../scripts/package/smoke-installed-package.js';

describe('installed Relay doctor contract', () => {
  it('retains the stable 14-check order', () => {
    expect(DOCTOR_CHECK_ORDER).toEqual([
      'runtime.version',
      'runtime.platform',
      'package.assets',
      'paths.resolution',
      'paths.access',
      'database.state',
      'database.integrity',
      'database.native-addon',
      'integrations.codex',
      'integrations.claude-code',
      'integrations.generic-mcp',
      'compatibility.assets',
      'mcp.handshake',
      'ui.loopback',
    ]);
  });
});

describe.skipIf(process.env.RELAY_RUN_PACKAGE_SMOKE !== '1')('installed Relay doctor smoke', () => {
  it('runs from an isolated prefix and arbitrary working directory', async () => {
    await verifyInstalledPackage();
  }, 300_000);
});
