import { mkdir } from 'node:fs/promises';
import { join } from 'node:path';
import type { RuntimePaths } from '../../distribution/resolve-runtime-paths.js';
import { initializeRelay } from '../../distribution/setup/initialize-relay.js';
import {
  createOwnershipStore,
  type OwnershipStore,
} from '../../distribution/setup/ownership-store.js';
import { applyIntegrationChange } from '../../distribution/setup/apply-integration-change.js';
import { createClaudeJsonAdapter } from '../../distribution/setup/clients/claude-json-adapter.js';
import { createCodexTomlAdapter } from '../../distribution/setup/clients/codex-toml-adapter.js';
import { planIntegrationChange } from '../../distribution/setup/plan-integration-change.js';
import { renderIntegrationSnippet } from '../../distribution/setup/snippets.js';
import type { MutableIntegrationClient } from '../../distribution/setup/setup-types.js';
import { parseOperationalCommand, type OperationalCommand } from './parse-operational-command.js';
import { writeOperationalError, writeOperationalSuccess } from './operational-output.js';

export interface OperationalDependencies {
  readonly runtimePaths: RuntimePaths;
  readonly openRuntime: (databasePath: string) => { close(): void };
  readonly applicationVersion: string;
  readonly ownershipStore?: OwnershipStore;
  readonly stdout: { write(text: string): unknown };
  readonly stderr: { write(text: string): unknown };
  readonly now?: () => Date;
}

export async function runOperationalCommand(
  argv: readonly string[],
  dependencies: OperationalDependencies,
): Promise<number> {
  let command: OperationalCommand;
  try {
    command = parseOperationalCommand(argv);
  } catch (error) {
    return writeOperationalError(dependencies.stdout, dependencies.stderr, error);
  }
  try {
    const store =
      dependencies.ownershipStore ??
      createOwnershipStore({
        metadataPath: join(dependencies.runtimePaths.configRoot, 'config.json'),
        applicationVersion: dependencies.applicationVersion,
      });
    const needsInitialization =
      command.kind === 'setup' ||
      command.kind === 'config-disable' ||
      command.kind === 'config-remove';
    const initialized = needsInitialization
      ? await initializeRelay({
          runtimePaths: dependencies.runtimePaths,
          openRuntime: dependencies.openRuntime,
          mkdir,
        })
      : undefined;
    if (command.kind === 'setup' && command.client === undefined && initialized !== undefined) {
      writeOperationalSuccess(dependencies.stdout, 'setup', {
        changed: initialized.createdDirectories.length > 0,
        createdDirectories: initialized.createdDirectories,
        paths: initialized,
      });
      return 0;
    }
    if (command.kind === 'config-paths') {
      writeOperationalSuccess(dependencies.stdout, 'config paths', {
        paths: {
          ...dependencies.runtimePaths,
          metadataPath: join(dependencies.runtimePaths.configRoot, 'config.json'),
        },
      });
      return 0;
    }
    if (command.kind === 'config-integrations') {
      const ownership = await store.read();
      writeOperationalSuccess(dependencies.stdout, 'config integrations', {
        integrations: ownership.integrations,
      });
      return 0;
    }
    if (command.kind === 'config-snippet') {
      writeOperationalSuccess(dependencies.stdout, 'config snippet', {
        client: command.client,
        snippet: renderIntegrationSnippet(command.client),
        changed: false,
      });
      return 0;
    }
    if (command.kind === 'setup' && command.client === 'generic-mcp') {
      writeOperationalSuccess(dependencies.stdout, 'setup', {
        client: command.client,
        changed: false,
        operation: 'unchanged',
        snippet: renderIntegrationSnippet(command.client),
      });
      return 0;
    }
    const client = command.client as MutableIntegrationClient;
    const configPath = command.configFile!;
    const adapter = client === 'codex' ? createCodexTomlAdapter() : createClaudeJsonAdapter();
    const ownership = await store.read();
    const action =
      command.kind === 'config-disable'
        ? 'disable'
        : command.kind === 'config-remove'
          ? 'remove'
          : 'setup';
    const plan = await planIntegrationChange({ action, client, configPath, adapter, ownership });
    if (command.kind === 'setup' && !command.apply) {
      writeOperationalSuccess(dependencies.stdout, 'setup', {
        client,
        changed: plan.changed,
        operation: plan.operation,
        path: plan.configPath,
        entryId: plan.entryId,
        snippet: plan.snippet,
      });
      return 0;
    }
    const result = await applyIntegrationChange({
      plan,
      adapter,
      ownershipStore: store,
      applicationVersion: dependencies.applicationVersion,
      now: dependencies.now?.() ?? new Date(),
    });
    writeOperationalSuccess(dependencies.stdout, action, {
      client: result.client,
      changed: result.changed,
      operation: result.operation,
      path: result.configPath,
      entryId: result.entryId,
      ...(result.backupPath === undefined ? {} : { backupPath: result.backupPath }),
    });
    return 0;
  } catch (error) {
    return writeOperationalError(dependencies.stdout, dependencies.stderr, error);
  }
}
