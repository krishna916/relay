import { constants } from 'node:fs';
import { dirname, isAbsolute, normalize, resolve } from 'node:path';
import type { access, stat } from 'node:fs/promises';
import type { RuntimePaths } from '../resolve-runtime-paths.js';
import type { DoctorCheck } from './doctor-types.js';

export function createPathResolutionCheck(input: {
  readonly runtimePaths: RuntimePaths;
  readonly metadataPath: string;
}): DoctorCheck {
  return {
    id: 'paths.resolution',
    run: async () => {
      const paths = {
        dataRoot: input.runtimePaths.dataRoot,
        configRoot: input.runtimePaths.configRoot,
        cacheRoot: input.runtimePaths.cacheRoot,
        databasePath: input.runtimePaths.databasePath,
        metadataPath: input.metadataPath,
      };
      const valid = Object.values(paths).every(
        (path) => isAbsolute(path) && normalize(resolve(path)) === path,
      );
      return valid
        ? {
            status: 'healthy' as const,
            code: 'paths.resolution.valid',
            message:
              'Relay resolved absolute runtime paths independently of the current directory.',
            details: paths,
          }
        : {
            status: 'failure' as const,
            code: 'paths.resolution.invalid',
            message: 'Relay resolved an invalid or relative runtime path.',
          };
    },
  };
}

export function createPathAccessCheck(input: {
  readonly runtimePaths: RuntimePaths;
  readonly metadataPath: string;
  readonly access: typeof access;
  readonly stat: typeof stat;
}): DoctorCheck {
  return {
    id: 'paths.access',
    run: async () => {
      const roots = [input.runtimePaths.dataRoot, input.runtimePaths.configRoot];
      for (const root of roots) {
        if (!(await directoryState(root))) {
          return {
            status: 'failure',
            code: 'paths.access.required-root-missing',
            message:
              'A required Relay data or configuration directory is unavailable. Run relay setup.',
            details: { path: root, exists: false, readable: false, writable: false },
          };
        }
      }

      const cache = await directoryState(input.runtimePaths.cacheRoot);
      if (!cache) {
        return {
          status: 'warning',
          code: 'paths.access.cache-missing',
          message: 'The Relay cache directory is not available.',
          details: { path: input.runtimePaths.cacheRoot, exists: false },
        };
      }

      const databaseParent = await directoryState(dirname(input.runtimePaths.databasePath));
      if (!databaseParent) {
        return {
          status: 'failure',
          code: 'paths.access.database-parent-inaccessible',
          message: 'The Relay database parent directory cannot be accessed.',
          details: { path: dirname(input.runtimePaths.databasePath), exists: false },
        };
      }

      try {
        await input.access(input.metadataPath, constants.R_OK);
      } catch {
        return {
          status: 'warning',
          code: 'paths.access.metadata-missing',
          message: 'Relay has no ownership metadata for an installed client integration.',
          details: { path: input.metadataPath, exists: false },
        };
      }

      return {
        status: 'healthy',
        code: 'paths.access.available',
        message: 'Relay runtime directories and ownership metadata are accessible.',
        details: { dataRoot: true, configRoot: true, cacheRoot: true, metadata: true },
      };
    },
  };

  async function directoryState(path: string): Promise<boolean> {
    try {
      await input.access(path, constants.R_OK | constants.W_OK);
      const information = await input.stat(path);
      return information.isDirectory();
    } catch {
      return false;
    }
  }
}
