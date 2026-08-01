import { describe, expect, it } from 'vitest';
import {
  getPlatformDefaultPaths,
  resolveRuntimePaths,
} from '../../../src/distribution/resolve-runtime-paths.js';

describe('Relay runtime paths', () => {
  it.each([
    ['win32', 'C:\\Users\\relay', 'C:\\Users\\relay\\AppData\\Local\\Relay\\relay.db'],
    ['darwin', '/Users/relay', '/Users/relay/Library/Application Support/Relay/relay.db'],
    ['linux', '/home/relay', '/home/relay/.local/share/relay/relay.db'],
  ] as const)(
    'calculates %s defaults without process globals',
    (platform, homeDir, databasePath) => {
      const paths = getPlatformDefaultPaths({ platform, homeDir, env: {} });
      expect(paths.databasePath).toBe(databasePath);
      expect(paths.dataRoot).toBe(
        platform === 'win32'
          ? 'C:\\Users\\relay\\AppData\\Local\\Relay'
          : platform === 'darwin'
            ? '/Users/relay/Library/Application Support/Relay'
            : '/home/relay/.local/share/relay',
      );
    },
  );

  it('uses Windows local and roaming application roots', () => {
    expect(
      getPlatformDefaultPaths({
        platform: 'win32',
        homeDir: 'C:\\Users\\relay',
        env: { LOCALAPPDATA: 'C:\\Local', APPDATA: 'C:\\Roaming' },
      }),
    ).toEqual({
      dataRoot: 'C:\\Local\\Relay',
      configRoot: 'C:\\Roaming\\Relay',
      cacheRoot: 'C:\\Local\\Relay\\Cache',
      databasePath: 'C:\\Local\\Relay\\relay.db',
    });
  });

  it('uses Linux XDG overrides', () => {
    expect(
      getPlatformDefaultPaths({
        platform: 'linux',
        homeDir: '/home/relay',
        env: {
          XDG_DATA_HOME: '/var/data',
          XDG_CONFIG_HOME: '/var/config',
          XDG_CACHE_HOME: '/var/cache',
        },
      }),
    ).toEqual({
      dataRoot: '/var/data/relay',
      configRoot: '/var/config/relay',
      cacheRoot: '/var/cache/relay',
      databasePath: '/var/data/relay/relay.db',
    });
  });

  it('applies explicit, environment, then platform default database precedence', () => {
    const input = {
      platform: 'linux' as const,
      homeDir: '/home/relay',
      env: { RELAY_DB_PATH: '/env.db' },
    };
    expect(
      resolveRuntimePaths({ ...input, explicitDatabasePath: '/explicit.db' }).databasePath,
    ).toBe('/explicit.db');
    expect(resolveRuntimePaths(input).databasePath).toBe('/env.db');
    expect(
      resolveRuntimePaths({ platform: 'linux', homeDir: '/home/relay', env: {} }).databasePath,
    ).toBe('/home/relay/.local/share/relay/relay.db');
  });

  it.each(['', '   '])('rejects whitespace RELAY_DB_PATH values (%j)', (value) => {
    expect(() =>
      resolveRuntimePaths({
        platform: 'linux',
        homeDir: '/home/relay',
        env: { RELAY_DB_PATH: value },
      }),
    ).toThrow(/RELAY_DB_PATH.*empty|whitespace/i);
  });

  it.each(['relative.db', 'nested/relative.db'])('rejects relative database paths (%s)', (path) => {
    expect(() =>
      resolveRuntimePaths({
        platform: 'linux',
        homeDir: '/home/relay',
        env: { RELAY_DB_PATH: path },
      }),
    ).toThrow(/absolute/i);
    expect(() =>
      resolveRuntimePaths({
        platform: 'linux',
        homeDir: '/home/relay',
        env: {},
        explicitDatabasePath: path,
      }),
    ).toThrow(/absolute/i);
  });
});
