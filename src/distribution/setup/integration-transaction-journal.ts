import { readFile, stat, unlink, writeFile } from 'node:fs/promises';
import { basename, dirname, join, normalize, resolve } from 'node:path';
import { randomUUID } from 'node:crypto';
import type { ClientConfigAdapter } from './clients/client-adapter.js';
import { replaceFile, restoreOriginalFile } from './backup-and-atomic-write.js';
import { fingerprint } from './plan-integration-change.js';
import type { OwnershipStore } from './ownership-store.js';
import type { MutableIntegrationClient } from './setup-types.js';
import { SetupConflictError, SetupStorageError } from './setup-errors.js';

export interface RelayIntegrationTransactionJournal {
  readonly schemaVersion: 1;
  readonly client: MutableIntegrationClient;
  readonly configPath: string;
  readonly entryId: 'relay';
  readonly action: 'setup' | 'disable' | 'remove';
  readonly phase: 'prepared' | 'client-written';
  readonly beforeFingerprint: string;
  readonly nextFingerprint: string;
  readonly originalExisted: boolean;
  readonly originalMode: number;
  readonly backupPath?: string;
  readonly applicationVersion: string;
  readonly startedAt: string;
}

export async function writeIntegrationTransactionJournal(
  journalPath: string,
  journal: RelayIntegrationTransactionJournal,
): Promise<void> {
  const temporaryPath = joinTemporaryPath(journalPath);
  try {
    await writeFile(temporaryPath, `${JSON.stringify(journal, null, 2)}\n`, {
      flag: 'wx',
      mode: 0o600,
    });
    await replaceFile(temporaryPath, journalPath);
  } catch (error) {
    await unlink(temporaryPath).catch(() => undefined);
    throw journalStorageError(journalPath, error);
  }
}

export async function deleteIntegrationTransactionJournal(journalPath: string): Promise<void> {
  try {
    await unlink(journalPath);
  } catch (error) {
    if (!isMissing(error)) throw journalStorageError(journalPath, error);
  }
}

export async function recoverIntegrationTransaction(input: {
  readonly journalPath: string;
  readonly configPath: string;
  readonly adapter: ClientConfigAdapter;
  readonly ownershipStore: OwnershipStore;
  readonly applicationVersion: string;
}): Promise<'none' | 'rolled-back' | 'completed'> {
  const journal = await readIntegrationTransactionJournal(input.journalPath);
  if (journal === undefined) return 'none';
  if (!samePath(journal.configPath, input.configPath))
    throw malformedJournalError(
      input.journalPath,
      new Error('Journal configuration path mismatch.'),
    );

  if (journal.phase === 'prepared') {
    const currentFingerprint = await readConfigFingerprint(input.configPath);
    if (currentFingerprint === journal.beforeFingerprint) {
      await deleteIntegrationTransactionJournal(input.journalPath);
      return 'rolled-back';
    }
    if (currentFingerprint !== journal.nextFingerprint)
      throw new SetupConflictError(
        `The client configuration changed during an interrupted Relay transaction. Preserve the transaction journal and backup: ${input.journalPath}`,
      );
  }

  const ownership = await input.ownershipStore.read();
  const record = ownership.integrations.find(
    (candidate) =>
      candidate.client === journal.client && samePath(candidate.configPath, journal.configPath),
  );
  const ownershipMatches =
    journal.action === 'remove'
      ? record === undefined
      : record?.status === (journal.action === 'setup' ? 'enabled' : 'disabled');
  if (ownershipMatches) {
    await deleteIntegrationTransactionJournal(input.journalPath);
    return 'completed';
  }

  try {
    if (journal.beforeFingerprint === journal.nextFingerprint) {
      if ((await readConfigFingerprint(input.configPath)) !== journal.beforeFingerprint)
        throw new SetupConflictError(
          `The client configuration changed during an interrupted Relay transaction. Preserve the transaction journal and backup: ${input.journalPath}`,
        );
      await deleteIntegrationTransactionJournal(input.journalPath);
      return 'rolled-back';
    }
    await restoreOriginalFile({
      ...(journal.backupPath === undefined ? {} : { backupPath: journal.backupPath }),
      targetPath: input.configPath,
      originalExisted: journal.originalExisted,
      originalMode: journal.originalMode,
    });
    await validateRestoredConfiguration(input.adapter, input.configPath, journal.originalExisted);
    await deleteIntegrationTransactionJournal(input.journalPath);
    return 'rolled-back';
  } catch (error) {
    throw new SetupStorageError(
      `Interrupted Relay transaction could not be recovered. The journal and backup were retained. Journal: ${input.journalPath}. Do not edit the client configuration until the journal is inspected or restored manually.`,
      new AggregateError([error, new Error(`Original transaction journal: ${input.journalPath}`)]),
    );
  }
}

async function readIntegrationTransactionJournal(
  journalPath: string,
): Promise<RelayIntegrationTransactionJournal | undefined> {
  let source: string;
  try {
    source = await readFile(journalPath, 'utf8');
  } catch (error) {
    if (isMissing(error)) return undefined;
    throw malformedJournalError(journalPath, error);
  }
  try {
    return validateJournal(JSON.parse(source));
  } catch (error) {
    throw malformedJournalError(journalPath, error);
  }
}

function validateJournal(value: unknown): RelayIntegrationTransactionJournal {
  if (!isRecord(value)) throw new Error('Journal must be an object.');
  const allowedKeys = new Set([
    'schemaVersion',
    'client',
    'configPath',
    'entryId',
    'action',
    'phase',
    'beforeFingerprint',
    'nextFingerprint',
    'originalExisted',
    'originalMode',
    'backupPath',
    'applicationVersion',
    'startedAt',
  ]);
  if (Object.keys(value).some((key) => !allowedKeys.has(key)))
    throw new Error('Journal contains unsupported fields.');
  if (
    value.schemaVersion !== 1 ||
    (value.client !== 'codex' && value.client !== 'claude-code') ||
    typeof value.configPath !== 'string' ||
    value.entryId !== 'relay' ||
    (value.action !== 'setup' && value.action !== 'disable' && value.action !== 'remove') ||
    (value.phase !== 'prepared' && value.phase !== 'client-written') ||
    typeof value.beforeFingerprint !== 'string' ||
    typeof value.nextFingerprint !== 'string' ||
    typeof value.originalExisted !== 'boolean' ||
    typeof value.originalMode !== 'number' ||
    (value.backupPath !== undefined && typeof value.backupPath !== 'string') ||
    typeof value.applicationVersion !== 'string' ||
    typeof value.startedAt !== 'string' ||
    !isAbsolutePath(value.configPath)
  )
    throw new Error('Journal has an unsupported schema.');
  return {
    schemaVersion: 1,
    client: value.client,
    configPath: normalize(resolve(value.configPath)),
    entryId: 'relay',
    action: value.action,
    phase: value.phase,
    beforeFingerprint: value.beforeFingerprint,
    nextFingerprint: value.nextFingerprint,
    originalExisted: value.originalExisted,
    originalMode: value.originalMode,
    ...(typeof value.backupPath === 'string' ? { backupPath: value.backupPath } : {}),
    applicationVersion: value.applicationVersion,
    startedAt: value.startedAt,
  };
}

async function validateRestoredConfiguration(
  adapter: ClientConfigAdapter,
  configPath: string,
  existed: boolean,
): Promise<void> {
  if (!existed) {
    try {
      await stat(configPath);
    } catch (error) {
      if (isMissing(error)) return;
      throw error;
    }
    throw new SetupStorageError(`Previously absent configuration was not removed: ${configPath}.`);
  }
  adapter.parse(await readFile(configPath, 'utf8'));
}

async function readConfigFingerprint(configPath: string): Promise<string> {
  try {
    return fingerprint(await readFile(configPath));
  } catch (error) {
    if (isMissing(error)) return fingerprint('');
    throw journalStorageError(configPath, error);
  }
}

function malformedJournalError(journalPath: string, cause: unknown): SetupStorageError {
  return new SetupStorageError(
    `Transaction journal is malformed or unsupported at ${journalPath}. Do not edit the client configuration until the journal is inspected or restored manually.`,
    cause,
  );
}

function journalStorageError(path: string, cause: unknown): SetupStorageError {
  return new SetupStorageError(`Transaction journal could not be updated at ${path}.`, cause);
}

function joinTemporaryPath(path: string): string {
  return join(dirname(path), `.${basename(path)}.${process.pid}.${randomUUID()}.tmp`);
}

function samePath(left: string, right: string): boolean {
  const normalizedLeft = normalize(resolve(left));
  const normalizedRight = normalize(resolve(right));
  return process.platform === 'win32'
    ? normalizedLeft.toLowerCase() === normalizedRight.toLowerCase()
    : normalizedLeft === normalizedRight;
}

function isAbsolutePath(value: string): boolean {
  return /^[A-Za-z]:[\\/]/.test(value) || value.startsWith('\\\\') || value.startsWith('/');
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function isMissing(error: unknown): boolean {
  return isRecord(error) && error.code === 'ENOENT';
}
