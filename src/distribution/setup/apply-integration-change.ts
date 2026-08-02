import type { ClientConfigAdapter } from './clients/client-adapter.js';
import { backupAndAtomicWrite, restoreFile } from './backup-and-atomic-write.js';
import { readFile } from 'node:fs/promises';
import { normalize, resolve } from 'node:path';
import { fingerprint } from './plan-integration-change.js';
import { SetupStorageError } from './setup-errors.js';
import type { IntegrationChangePlan, IntegrationChangeResult } from './setup-types.js';
import type { OwnershipStore } from './ownership-store.js';

export async function applyIntegrationChange(input: {
  readonly plan: IntegrationChangePlan;
  readonly adapter: ClientConfigAdapter;
  readonly ownershipStore: OwnershipStore;
  readonly applicationVersion: string;
  readonly now: Date;
}): Promise<IntegrationChangeResult> {
  if (!input.plan.changed) {
    return {
      client: input.plan.client,
      configPath: input.plan.configPath,
      entryId: 'relay',
      operation: 'unchanged',
      changed: false,
    };
  }
  const clientChanged = fingerprint(input.plan.nextContent) !== input.plan.beforeFingerprint;
  const backup = clientChanged
    ? await backupAndAtomicWrite({
        targetPath: input.plan.configPath,
        expectedFingerprint: input.plan.beforeFingerprint,
        nextContent: input.plan.nextContent,
        validate: (content) => input.adapter.parse(content),
        now: input.now,
      })
    : undefined;
  try {
    const nextRecord = {
      client: input.plan.client,
      configPath: input.plan.configPath,
      entryId: 'relay' as const,
      command: 'relay' as const,
      args: ['mcp'] as const,
      status: input.plan.operation === 'disabled' ? ('disabled' as const) : ('enabled' as const),
      applicationVersion: input.applicationVersion,
      lastSuccessfulSetupAt: input.now.toISOString(),
      ...(backup === undefined ? {} : { lastBackupPath: backup.backupPath }),
    };
    await input.ownershipStore.update((ownership) => {
      const existing = ownership.integrations.filter(
        (record) =>
          !(
            record.client === input.plan.client &&
            sameOwnedPath(record.configPath, input.plan.configPath)
          ),
      );
      return {
        schemaVersion: 1,
        integrations: input.plan.operation === 'removed' ? existing : [...existing, nextRecord],
      };
    });
  } catch (error) {
    try {
      if (backup !== undefined) {
        await restoreFile(backup.backupPath, input.plan.configPath);
        input.adapter.parse(await readFile(input.plan.configPath, 'utf8'));
      }
    } catch (restoreError) {
      throw new SetupStorageError(
        `Client configuration was replaced but could not be restored from ${backup?.backupPath ?? input.plan.configPath}.`,
        restoreError,
      );
    }
    throw new SetupStorageError(
      `Client configuration was restored after metadata persistence failed: ${input.plan.configPath}.`,
      error,
    );
  }
  return {
    client: input.plan.client,
    configPath: input.plan.configPath,
    entryId: 'relay',
    operation: input.plan.operation,
    changed: true,
    ...(backup === undefined ? {} : { backupPath: backup.backupPath }),
  };
}

function sameOwnedPath(left: string, right: string): boolean {
  const normalizedLeft = normalize(resolve(left));
  const normalizedRight = normalize(resolve(right));
  return process.platform === 'win32'
    ? normalizedLeft.toLowerCase() === normalizedRight.toLowerCase()
    : normalizedLeft === normalizedRight;
}
