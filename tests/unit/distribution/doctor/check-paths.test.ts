import { describe, expect, it } from 'vitest';
import {
  createPathAccessCheck,
  createPathResolutionCheck,
} from '../../../../src/distribution/doctor/check-paths.js';
import type { RuntimePaths } from '../../../../src/distribution/resolve-runtime-paths.js';

const runtimePaths: RuntimePaths = {
  dataRoot: 'D:\\Users\\relay\\AppData',
  configRoot: 'D:\\Users\\relay\\Config',
  cacheRoot: 'D:\\Users\\relay\\Cache',
  databasePath: 'D:\\Users\\relay\\AppData\\relay.db',
};

describe('doctor path checks', () => {
  it('reports resolved absolute paths without depending on cwd', async () => {
    const result = await createPathResolutionCheck({
      runtimePaths,
      metadataPath: 'D:\\Users\\relay\\Config\\config.json',
    }).run();
    expect(result).toMatchObject({ status: 'healthy', code: 'paths.resolution.valid' });
    expect(result.details).toMatchObject({
      dataRoot: runtimePaths.dataRoot,
      databasePath: runtimePaths.databasePath,
    });
  });

  it('fails invalid relative paths', async () => {
    const result = await createPathResolutionCheck({
      runtimePaths: { ...runtimePaths, dataRoot: 'relative' },
      metadataPath: runtimePaths.databasePath,
    }).run();
    expect(result).toMatchObject({ status: 'failure', code: 'paths.resolution.invalid' });
  });

  it('reports missing ownership metadata as a warning and does not create probes', async () => {
    const accessed: string[] = [];
    const result = await createPathAccessCheck({
      runtimePaths,
      metadataPath: 'D:\\Users\\relay\\Config\\config.json',
      access: async (path) => {
        const value = path.toString();
        accessed.push(value);
        if (value.endsWith('config.json')) throw new Error('missing');
      },
      stat: async () => ({ isDirectory: () => true }) as never,
    }).run();
    expect(result).toMatchObject({ status: 'warning', code: 'paths.access.metadata-missing' });
    expect(accessed).not.toContain(expect.stringContaining('probe'));
  });

  it('fails when the required data root is absent', async () => {
    const result = await createPathAccessCheck({
      runtimePaths,
      metadataPath: 'D:\\Users\\relay\\Config\\config.json',
      access: async (path) => {
        if (path.toString() === runtimePaths.dataRoot) throw new Error('missing');
      },
      stat: async () => ({ isDirectory: () => true }) as never,
    }).run();
    expect(result).toMatchObject({
      status: 'failure',
      code: 'paths.access.required-root-missing',
      message: 'A required Relay data or configuration directory is unavailable. Run relay setup.',
    });
  });
});
