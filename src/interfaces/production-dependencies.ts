import { runMcpServer } from './mcp/main.js';
import { runUiServer } from './http/main.js';
import { join } from 'node:path';
import { resolveRuntimePaths } from '../distribution/resolve-runtime-paths.js';
import { readPackageVersion } from '../distribution/package-version.js';
import { createTaskRuntime } from './shared/create-task-runtime.js';
import { createOwnershipStore } from '../distribution/setup/ownership-store.js';
import type { OperationalDependencies } from './cli/run-operational-command.js';

export { runMcpServer, runUiServer };

export function createOperationalDependencies(output: {
  stdout: { write(text: string): unknown };
  stderr: { write(text: string): unknown };
}): OperationalDependencies {
  const runtimePaths = resolveRuntimePaths();
  const applicationVersion = readPackageVersion();
  return {
    runtimePaths,
    applicationVersion,
    openRuntime: (databasePath) => createTaskRuntime({ databasePath }),
    ownershipStore: createOwnershipStore({
      metadataPath: join(runtimePaths.configRoot, 'config.json'),
      applicationVersion,
    }),
    stdout: output.stdout,
    stderr: output.stderr,
    now: () => new Date(),
  };
}
