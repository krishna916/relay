import { resolveRuntimePaths } from '../distribution/resolve-runtime-paths.js';

export function getDefaultDatabasePath(): string {
  return resolveRuntimePaths().databasePath;
}

export function resolveDatabasePath(explicitPath?: string): string {
  return resolveRuntimePaths(
    explicitPath === undefined ? {} : { explicitDatabasePath: explicitPath },
  ).databasePath;
}
