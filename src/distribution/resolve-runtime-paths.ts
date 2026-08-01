import { homedir } from 'node:os';
import { isAbsolute as posixIsAbsolute } from 'node:path/posix';
import { isAbsolute as win32IsAbsolute } from 'node:path/win32';
import { RelayError } from '../shared/errors.js';
import { getPlatformDefaultPaths, type RuntimePaths } from './platform-paths.js';

export type { PlatformPathInput, RuntimePaths } from './platform-paths.js';
export { getPlatformDefaultPaths } from './platform-paths.js';

interface RuntimePathInput {
  readonly explicitDatabasePath?: string;
  readonly platform?: NodeJS.Platform;
  readonly homeDir?: string;
  readonly env?: Readonly<Record<string, string | undefined>>;
}

function isAbsoluteForPlatform(value: string, platform: NodeJS.Platform): boolean {
  return platform === 'win32' ? win32IsAbsolute(value) : posixIsAbsolute(value);
}

function selectDatabasePath(
  input: RuntimePathInput,
  paths: RuntimePaths,
  platform: NodeJS.Platform,
  env: Readonly<Record<string, string | undefined>>,
): string {
  const candidate = input.explicitDatabasePath ?? env.RELAY_DB_PATH;
  if (candidate !== undefined) {
    const normalized = candidate.trim();
    if (!normalized)
      throw new RelayError('RELAY_DB_PATH/database path cannot be empty or whitespace only.');
    if (normalized !== ':memory:' && !isAbsoluteForPlatform(normalized, platform)) {
      throw new RelayError(`Database path must be absolute: ${normalized}`);
    }
    return normalized;
  }
  return paths.databasePath;
}

export function resolveRuntimePaths(input: RuntimePathInput = {}): RuntimePaths {
  const platform = input.platform ?? process.platform;
  const homeDir = input.homeDir ?? homedir();
  const env = input.env ?? process.env;
  const defaults = getPlatformDefaultPaths({ platform, homeDir, env });
  return { ...defaults, databasePath: selectDatabasePath(input, defaults, platform, env) };
}
