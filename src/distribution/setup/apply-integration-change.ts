import { readFile, stat } from 'node:fs/promises';
import { normalize, resolve } from 'node:path';
import type { ClientConfigAdapter } from './clients/client-adapter.js';
import {
  backupAndAtomicWrite,
  restoreOriginalFile,
  type BackupAndAtomicWriteResult,
} from './backup-and-atomic-write.js';
import {
  deleteIntegrationTransactionJournal,
  writeIntegrationTransactionJournal,
  type RelayIntegrationTransactionJournal,
} from './integration-transaction-journal.js';
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
  readonly clientLockHeld?: boolean;
  readonly lockRetryDelayMs?: number;
  readonly lockMaxAttempts?: number;
  readonly sleep?: (milliseconds: number) => Promise<void>;
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
  const journalPath = `${input.plan.configPath}.relay-transaction.json`;
  const action = async (): Promise<IntegrationChangeResult> => {
    const clientChanged = fingerprint(input.plan.nextContent) !== input.plan.beforeFingerprint;
    let backup: BackupAndAtomicWriteResult | undefined;
    let journal: RelayIntegrationTransactionJournal | undefined;
    let ownershipPersisted = false;
    try {
      if (clientChanged) {
        backup = await backupAndAtomicWrite({
          targetPath: input.plan.configPath,
          expectedFingerprint: input.plan.beforeFingerprint,
          nextContent: input.plan.nextContent,
          validate: (content) => input.adapter.parse(content),
          now: input.now,
          beforeReplace: async (result) => {
            journal = createJournal(input, result);
            await writeIntegrationTransactionJournal(journalPath, journal);
          },
        });
      } else {
        const original = await readOriginalState(input.plan.configPath);
        journal = createJournal(input, original);
        await writeIntegrationTransactionJournal(journalPath, journal);
      }

      if (journal === undefined)
        throw new SetupStorageError('Transaction journal was not prepared.');
      await writeIntegrationTransactionJournal(journalPath, {
        ...journal,
        phase: 'client-written',
      });

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
      ownershipPersisted = true;
      await deleteIntegrationTransactionJournal(journalPath);
    } catch (error) {
      if (ownershipPersisted) throw error;
      if (journal === undefined) throw error;
      if (backup === undefined) {
        try {
          await deleteIntegrationTransactionJournal(journalPath);
        } catch (journalError) {
          throw new SetupStorageError(
            `No-content-change transaction journal could not be removed at ${journalPath}.`,
            new AggregateError([error, journalError]),
          );
        }
        throw error;
      }
      try {
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
        await deleteIntegrationTransactionJournal(journalPath);
      } catch (restoreError) {
        throw new SetupStorageError(
          `Client configuration was replaced but could not be restored from ${backup.backupPath ?? input.plan.configPath}.`,
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
  };

  if (input.clientLockHeld) return action();
  return withExclusiveFileLock(`${input.plan.configPath}.relay-lock`, action, {
    ...(input.lockRetryDelayMs === undefined ? {} : { retryDelayMs: input.lockRetryDelayMs }),
    ...(input.lockMaxAttempts === undefined ? {} : { maxAttempts: input.lockMaxAttempts }),
    ...(input.sleep === undefined ? {} : { sleep: input.sleep }),
    recoveryJournalPath: journalPath,
  });
}

function createJournal(
  input: Parameters<typeof applyIntegrationChange>[0],
  original: BackupAndAtomicWriteResult,
): RelayIntegrationTransactionJournal {
  return {
    schemaVersion: 1,
    client: input.plan.client,
    configPath: input.plan.configPath,
    entryId: RELAY_ENTRY_ID,
    action:
      input.plan.operation === 'disabled'
        ? 'disable'
        : input.plan.operation === 'removed'
          ? 'remove'
          : 'setup',
    phase: 'prepared',
    beforeFingerprint: input.plan.beforeFingerprint,
    nextFingerprint: fingerprint(input.plan.nextContent),
    originalExisted: original.originalExisted,
    originalMode: original.originalMode,
    ...(original.backupPath === undefined ? {} : { backupPath: original.backupPath }),
    applicationVersion: input.applicationVersion,
    startedAt: input.now.toISOString(),
  };
}

async function readOriginalState(path: string): Promise<BackupAndAtomicWriteResult> {
  try {
    return { originalExisted: true, originalMode: (await stat(path)).mode & 0o777 };
  } catch (error) {
    if (isMissing(error)) return { originalExisted: false, originalMode: 0o600 };
    throw new SetupStorageError(`Could not inspect configuration at ${path}.`, error);
  }
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
