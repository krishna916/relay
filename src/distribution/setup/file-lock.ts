import { mkdir, open, unlink, type FileHandle } from 'node:fs/promises';
import { dirname } from 'node:path';
import { SetupConflictError, SetupStorageError } from './setup-errors.js';

export const SETUP_LOCK_RETRY_DELAY_MS = 25;
export const SETUP_LOCK_MAX_ATTEMPTS = 40;

export interface ExclusiveFileLockOptions {
  readonly retryDelayMs?: number;
  readonly maxAttempts?: number;
  readonly sleep?: (milliseconds: number) => Promise<void>;
}

export async function withExclusiveFileLock<T>(
  lockPath: string,
  action: () => Promise<T>,
  options: ExclusiveFileLockOptions = {},
): Promise<T> {
  try {
    await mkdir(dirname(lockPath), { recursive: true });
  } catch (error) {
    throw new SetupStorageError(
      `Setup lock directory could not be prepared at ${lockPath}.`,
      error,
    );
  }

  const retryDelayMs = options.retryDelayMs ?? SETUP_LOCK_RETRY_DELAY_MS;
  const maxAttempts = options.maxAttempts ?? SETUP_LOCK_MAX_ATTEMPTS;
  const sleep = options.sleep ?? delay;
  let handle: FileHandle | undefined;
  let attempts = 0;
  while (handle === undefined) {
    try {
      handle = await open(lockPath, 'wx', 0o600);
    } catch (error) {
      if (!isExists(error))
        throw new SetupStorageError(`Setup lock could not be opened at ${lockPath}.`, error);
      attempts += 1;
      if (attempts >= maxAttempts)
        throw new SetupConflictError(
          `Another Relay configuration operation is in progress. Retry after it completes. Lock: ${lockPath}`,
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
      throw new SetupStorageError(`Setup lock could not be written at ${lockPath}.`, error);
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
    if (!isMissing(error)) cleanupError ??= error;
  }
  if (cleanupError !== undefined)
    throw new SetupStorageError(`Setup lock could not be released at ${lockPath}.`, cleanupError);
  if (actionFailed) throw actionError;
  return result as T;
}

async function delay(milliseconds: number): Promise<void> {
  await new Promise<void>((resolveDelay) => setTimeout(resolveDelay, milliseconds));
}

function isExists(error: unknown): boolean {
  return isRecord(error) && error.code === 'EEXIST';
}

function isMissing(error: unknown): boolean {
  return isRecord(error) && error.code === 'ENOENT';
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null;
}
