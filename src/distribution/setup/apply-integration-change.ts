import type { ClientConfigAdapter } from './clients/client-adapter.js';
import {
  backupAndAtomicWrite,
  restoreOriginalFile,
  type BackupAndAtomicWriteResult,
} from './backup-and-atomic-write.js';
import { readFile, stat } from 'node:fs/promises';
import { normalize, resolve } from 'node:path';
import { withExclusiveFileLock } from './file-lock.js';
import { RELAY_ARGS, RELAY_COMMAND, RELAY_ENTRY_ID } from './relay-entry.js';
import { fingerprint } from './plan-integration-change.js';
import { SetupConflictError, SetupStorageError } from './setup-errors.js';
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
      entryId: RELAY_ENTRY_ID,
      operation: 'unchanged',
      changed: false,
    };
  }
  return withExclusiveFileLock(`${input.plan.configPath}.relay-lock`, async () => {
    const clientChanged = fingerprint(input.plan.nextContent) !== input.plan.beforeFingerprint;
    let backup: BackupAndAtomicWriteResult | undefined;
    try {
      if (clientChanged) {
        backup = await backupAndAtomicWrite({
          targetPath: input.plan.configPath,
          expectedFingerprint: input.plan.beforeFingerprint,
          nextContent: input.plan.nextContent,
          validate: (content) => input.adapter.parse(content),
          now: input.now,
        });
      }

      const nextRecord = {
        client: input.plan.client,
        configPath: input.plan.configPath,
        entryId: RELAY_ENTRY_ID,
        command: RELAY_COMMAND,
        args: RELAY_ARGS,
        status: input.plan.operation === 'disabled' ? ('disabled' as const) : ('enabled' as const),
        applicationVersion: input.applicationVersion,
        lastSuccessfulSetupAt: input.now.toISOString(),
        ...(backup?.backupPath === undefined ? {} : { lastBackupPath: backup.backupPath }),
      };
      await input.ownershipStore.update(async (ownership) => {
        if (
          !clientChanged &&
          fingerprint(await readCurrentContent(input.plan.configPath)) !==
            input.plan.beforeFingerprint
        ) {
          throw new SetupConflictError(
            `Configuration changed before ownership metadata update: ${input.plan.configPath}`,
          );
        }
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
          await restoreOriginalFile({
            ...(backup.backupPath === undefined ? {} : { backupPath: backup.backupPath }),
            targetPath: input.plan.configPath,
            originalExisted: backup.originalExisted,
            originalMode: backup.originalMode,
          });
          if (backup.originalExisted) {
            input.adapter.parse(await readFile(input.plan.configPath, 'utf8'));
          } else {
            await assertAbsent(input.plan.configPath);
          }
        }
      } catch (restoreError) {
        throw new SetupStorageError(
          `Client configuration was replaced but could not be restored from ${backup?.backupPath ?? input.plan.configPath}.`,
          new AggregateError([error, restoreError]),
        );
      }
      if (error instanceof SetupConflictError) throw error;
      throw new SetupStorageError(
        `Client configuration was restored after metadata persistence failed: ${input.plan.configPath}.`,
        error,
      );
    }
    return {
      client: input.plan.client,
      configPath: input.plan.configPath,
      entryId: RELAY_ENTRY_ID,
      operation: input.plan.operation,
      changed: true,
      ...(backup?.backupPath === undefined ? {} : { backupPath: backup.backupPath }),
    };
  });
}

async function readCurrentContent(path: string): Promise<string> {
  try {
    return await readFile(path, 'utf8');
  } catch (error) {
    if (isMissing(error)) return '';
    throw new SetupStorageError(`Client configuration could not be reread: ${path}.`, error);
  }
}

function sameOwnedPath(left: string, right: string): boolean {
  const normalizedLeft = normalize(resolve(left));
  const normalizedRight = normalize(resolve(right));
  return process.platform === 'win32'
    ? normalizedLeft.toLowerCase() === normalizedRight.toLowerCase()
    : normalizedLeft === normalizedRight;
}

async function assertAbsent(path: string): Promise<void> {
  try {
    await stat(path);
  } catch (error) {
    if (isMissing(error)) return;
    throw error;
  }
  throw new SetupStorageError(`Previously absent configuration was not removed: ${path}.`);
}

function isMissing(error: unknown): boolean {
  return typeof error === 'object' && error !== null && 'code' in error && error.code === 'ENOENT';
}
