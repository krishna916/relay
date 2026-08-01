import { join as posixJoin } from 'node:path/posix';
import { join as win32Join } from 'node:path/win32';

export interface PlatformPathInput {
  readonly platform: NodeJS.Platform;
  readonly homeDir: string;
  readonly env: Readonly<Record<string, string | undefined>>;
}

export interface RuntimePaths {
  readonly dataRoot: string;
  readonly configRoot: string;
  readonly cacheRoot: string;
  readonly databasePath: string;
}

export function getPlatformDefaultPaths(input: PlatformPathInput): RuntimePaths {
  if (input.platform === 'win32') {
    const localAppData = input.env.LOCALAPPDATA ?? win32Join(input.homeDir, 'AppData', 'Local');
    const appData = input.env.APPDATA ?? win32Join(input.homeDir, 'AppData', 'Roaming');
    const dataRoot = win32Join(localAppData, 'Relay');
    return {
      dataRoot,
      configRoot: win32Join(appData, 'Relay'),
      cacheRoot: win32Join(dataRoot, 'Cache'),
      databasePath: win32Join(dataRoot, 'relay.db'),
    };
  }

  if (input.platform === 'darwin') {
    const dataRoot = posixJoin(input.homeDir, 'Library', 'Application Support', 'Relay');
    return {
      dataRoot,
      configRoot: posixJoin(dataRoot, 'config'),
      cacheRoot: posixJoin(input.homeDir, 'Library', 'Caches', 'Relay'),
      databasePath: posixJoin(dataRoot, 'relay.db'),
    };
  }

  const dataRoot = posixJoin(
    input.env.XDG_DATA_HOME ?? posixJoin(input.homeDir, '.local', 'share'),
    'relay',
  );
  return {
    dataRoot,
    configRoot: posixJoin(
      input.env.XDG_CONFIG_HOME ?? posixJoin(input.homeDir, '.config'),
      'relay',
    ),
    cacheRoot: posixJoin(input.env.XDG_CACHE_HOME ?? posixJoin(input.homeDir, '.cache'), 'relay'),
    databasePath: posixJoin(dataRoot, 'relay.db'),
  };
}
