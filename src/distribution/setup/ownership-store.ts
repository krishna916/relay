import { randomUUID } from 'node:crypto';
import { mkdir, open, readFile, unlink, writeFile, type FileHandle } from 'node:fs/promises';
import { dirname, normalize, resolve } from 'node:path';
import { replaceFile } from './backup-and-atomic-write.js';
import type { RelayIntegrationOwnership, RelayOwnershipFile } from './setup-types.js';
import { SetupConflictError, SetupStorageError } from './setup-errors.js';

const OWNERSHIP_LOCK_RETRY_DELAY_MS = 25;
const OWNERSHIP_LOCK_MAX_ATTEMPTS = 40;

export interface OwnershipStore {
  read(): Promise<RelayOwnershipFile>;
  update(mutate: (current: RelayOwnershipFile) => RelayOwnershipFile): Promise<RelayOwnershipFile>;
}

export function createOwnershipStore(input: {
  readonly metadataPath: string;
  readonly applicationVersion: string;
  readonly lockRetryDelayMs?: number;
  readonly lockMaxAttempts?: number;
  readonly sleep?: (milliseconds: number) => Promise<void>;
}): OwnershipStore {
  const readOwnership = async (): Promise<RelayOwnershipFile> => {
    let source: string;
    try {
      source = await readFile(input.metadataPath, 'utf8');
    } catch (error) {
      if (isMissingFile(error)) return { schemaVersion: 1, integrations: [] };
      throw new SetupStorageError(
        `Relay ownership metadata could not be read at ${input.metadataPath}.`,
        error,
      );
    }
    try {
      return validateOwnership(JSON.parse(source), input.applicationVersion);
    } catch (error) {
      throw new SetupStorageError(
        `Relay ownership metadata schema is invalid at ${input.metadataPath}.`,
        {
          cause: error,
        },
      );
    }
  };

  const writeValidatedOwnership = async (next: RelayOwnershipFile): Promise<void> => {
    try {
      await mkdir(dirname(input.metadataPath), { recursive: true });
    } catch (error) {
      throw new SetupStorageError(
        `Relay ownership metadata could not be prepared at ${input.metadataPath}.`,
        error,
      );
    }
    const temporaryPath = `${input.metadataPath}.${process.pid}.${randomUUID()}.tmp`;
    try {
      await writeFile(temporaryPath, `${JSON.stringify(next, null, 2)}\n`, 'utf8');
      await replaceFile(temporaryPath, input.metadataPath);
    } catch (error) {
      await unlink(temporaryPath).catch(() => undefined);
      throw new SetupStorageError(
        `Relay ownership metadata could not be written at ${input.metadataPath}.`,
        error,
      );
    }
  };

  return {
    read: readOwnership,
    update: async (mutate) => {
      return withOwnershipLock(
        input.metadataPath,
        async () => {
          const current = await readOwnership();
          const next = validateOwnership(mutate(current), input.applicationVersion);
          await writeValidatedOwnership(next);
          return next;
        },
        {
          ...(input.lockRetryDelayMs === undefined
            ? {}
            : { lockRetryDelayMs: input.lockRetryDelayMs }),
          ...(input.lockMaxAttempts === undefined
            ? {}
            : { lockMaxAttempts: input.lockMaxAttempts }),
          ...(input.sleep === undefined ? {} : { sleep: input.sleep }),
        },
      );
    },
  };
}

async function withOwnershipLock<T>(
  metadataPath: string,
  action: () => Promise<T>,
  options: {
    readonly lockRetryDelayMs?: number;
    readonly lockMaxAttempts?: number;
    readonly sleep?: (milliseconds: number) => Promise<void>;
  } = {},
): Promise<T> {
  const lockPath = `${metadataPath}.relay-lock`;
  const retryDelayMs = options.lockRetryDelayMs ?? OWNERSHIP_LOCK_RETRY_DELAY_MS;
  const maxAttempts = options.lockMaxAttempts ?? OWNERSHIP_LOCK_MAX_ATTEMPTS;
  const sleep = options.sleep ?? ((milliseconds: number) => delay(milliseconds));
  try {
    await mkdir(dirname(metadataPath), { recursive: true });
  } catch (error) {
    throw new SetupStorageError(
      `Relay ownership metadata could not be prepared at ${metadataPath}.`,
      error,
    );
  }

  let handle: FileHandle | undefined;
  let attempts = 0;
  while (handle === undefined) {
    try {
      handle = await open(lockPath, 'wx', 0o600);
    } catch (error) {
      if (!isExists(error))
        throw new SetupStorageError(
          `Relay ownership lock could not be opened at ${lockPath}.`,
          error,
        );
      attempts += 1;
      if (attempts >= maxAttempts)
        throw new SetupConflictError(
          `Another Relay configuration operation is in progress for ${metadataPath}. Retry after it completes.`,
        );
      await sleep(retryDelayMs);
    }
  }

  let result: T | undefined;
  let actionFailed = false;
  let actionError: unknown;
  try {
    try {
      await handle.writeFile(
        `${JSON.stringify({ pid: process.pid, acquiredAt: new Date().toISOString() })}\n`,
        'utf8',
      );
      await handle.sync();
    } catch (error) {
      throw new SetupStorageError(
        `Relay ownership lock could not be written at ${lockPath}.`,
        error,
      );
    }
    result = await action();
  } catch (error) {
    actionFailed = true;
    actionError = error;
  }

  let cleanupError: unknown;
  try {
    await handle.close();
  } catch (error) {
    cleanupError = error;
  }
  try {
    await unlink(lockPath);
  } catch (error) {
    if (!isMissingFile(error)) cleanupError ??= error;
  }
  if (cleanupError !== undefined)
    throw new SetupStorageError(
      `Relay ownership lock could not be released at ${lockPath}.`,
      cleanupError,
    );
  if (actionFailed) throw actionError;
  return result as T;
}

async function delay(milliseconds: number): Promise<void> {
  await new Promise<void>((resolveDelay) => setTimeout(resolveDelay, milliseconds));
}

function validateOwnership(value: unknown, _applicationVersion: string): RelayOwnershipFile {
  if (!isRecord(value) || value.schemaVersion !== 1 || !Array.isArray(value.integrations)) {
    throw new Error('Relay ownership metadata has an unsupported schema.');
  }
  const integrations = value.integrations.map((record) => validateRecord(record));
  const seen = new Set<string>();
  for (const record of integrations) {
    const key = `${record.client}:${pathKey(record.configPath)}`;
    if (seen.has(key)) throw new Error('Relay ownership metadata contains duplicate integrations.');
    seen.add(key);
  }
  integrations.sort((left, right) =>
    `${left.client}:${pathKey(left.configPath)}`.localeCompare(
      `${right.client}:${pathKey(right.configPath)}`,
    ),
  );
  return { schemaVersion: 1, integrations };
}

function validateRecord(value: unknown): RelayIntegrationOwnership {
  if (!isRecord(value)) throw new Error('Relay ownership record is invalid.');
  if (
    (value.client !== 'codex' && value.client !== 'claude-code') ||
    value.entryId !== 'relay' ||
    value.command !== 'relay' ||
    !Array.isArray(value.args) ||
    value.args.length !== 1 ||
    value.args[0] !== 'mcp' ||
    (value.status !== 'enabled' && value.status !== 'disabled') ||
    typeof value.applicationVersion !== 'string' ||
    typeof value.lastSuccessfulSetupAt !== 'string' ||
    typeof value.configPath !== 'string' ||
    !isAbsolutePath(value.configPath)
  ) {
    throw new Error('Relay ownership record is invalid.');
  }
  return {
    client: value.client,
    configPath: normalize(resolve(value.configPath)),
    entryId: 'relay',
    command: 'relay',
    args: ['mcp'],
    status: value.status,
    applicationVersion: value.applicationVersion,
    lastSuccessfulSetupAt: value.lastSuccessfulSetupAt,
    ...(typeof value.lastBackupPath === 'string' ? { lastBackupPath: value.lastBackupPath } : {}),
  };
}

function isAbsolutePath(value: string): boolean {
  return /^[A-Za-z]:[\\/]/.test(value) || value.startsWith('\\\\') || value.startsWith('/');
}

function pathKey(value: string): string {
  const normalized = normalize(resolve(value));
  return process.platform === 'win32' ? normalized.toLowerCase() : normalized;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function isMissingFile(error: unknown): boolean {
  return isRecord(error) && error.code === 'ENOENT';
}

function isExists(error: unknown): boolean {
  return isRecord(error) && error.code === 'EEXIST';
}
