import type { mkdir } from 'node:fs/promises';
import type { RuntimePaths } from '../resolve-runtime-paths.js';
import { SetupStorageError } from './setup-errors.js';

export interface InitializeRelayDependencies {
  readonly runtimePaths: RuntimePaths;
  readonly openRuntime: (databasePath: string) => { close(): void };
  readonly mkdir: typeof mkdir;
}

export interface InitializeRelayResult {
  readonly dataRoot: string;
  readonly configRoot: string;
  readonly databasePath: string;
  readonly createdDirectories: readonly string[];
}

export async function initializeRelay(
  dependencies: InitializeRelayDependencies,
): Promise<InitializeRelayResult> {
  const createdDirectories: string[] = [];
  try {
    for (const directory of [
      dependencies.runtimePaths.dataRoot,
      dependencies.runtimePaths.configRoot,
    ]) {
      const created = await dependencies.mkdir(directory, { recursive: true });
      if (created !== undefined) createdDirectories.push(created);
    }
  } catch (error) {
    throw new SetupStorageError('Relay directories could not be initialized.', error);
  }

  let runtime: { close(): void };
  try {
    runtime = dependencies.openRuntime(dependencies.runtimePaths.databasePath);
  } catch (error) {
    throw new SetupStorageError('Relay database could not be initialized.', error);
  }
  try {
    return {
      dataRoot: dependencies.runtimePaths.dataRoot,
      configRoot: dependencies.runtimePaths.configRoot,
      databasePath: dependencies.runtimePaths.databasePath,
      createdDirectories,
    };
  } finally {
    runtime.close();
  }
}
