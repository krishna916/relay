import { describe, expect, it } from 'vitest';
import {
  createRuntimePlatformCheck,
  createRuntimeVersionCheck,
} from '../../../../src/distribution/doctor/check-runtime.js';

describe('doctor runtime checks', () => {
  it.each(['24.0.0', '24.13.3'])('accepts Node %s', async (nodeVersion) => {
    await expect(
      createRuntimeVersionCheck({ nodeVersion, expectedMajor: 24 }).run(),
    ).resolves.toMatchObject({
      status: 'healthy',
      code: 'runtime.version.supported',
    });
  });

  it('rejects a Node version outside the supported major', async () => {
    await expect(
      createRuntimeVersionCheck({ nodeVersion: '25.0.0', expectedMajor: 24 }).run(),
    ).resolves.toMatchObject({
      status: 'failure',
      code: 'runtime.version.unsupported',
      message: 'Relay requires Node.js 24.x.',
    });
  });

  it.each([
    ['win32', 'x64', undefined],
    ['darwin', 'arm64', undefined],
    ['linux', 'x64', '2.39'],
  ] as const)('accepts supported platform tuple %s/%s', async (platform, arch, glibc) => {
    await expect(
      createRuntimePlatformCheck({
        platform,
        arch,
        report: glibc === undefined ? {} : { glibc },
      }).run(),
    ).resolves.toMatchObject({
      status: 'healthy',
      code: 'runtime.platform.supported',
    });
  });

  it('rejects Linux without glibc', async () => {
    await expect(
      createRuntimePlatformCheck({ platform: 'linux', arch: 'x64', report: {} }).run(),
    ).resolves.toMatchObject({
      status: 'failure',
      code: 'runtime.platform.unsupported',
      message: 'Relay supports Windows x64, macOS arm64, and Linux x64 with glibc.',
    });
  });
});
