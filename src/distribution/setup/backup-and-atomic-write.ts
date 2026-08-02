import { randomUUID } from 'node:crypto';
import { chmod, open, readFile, rename, stat, unlink, writeFile } from 'node:fs/promises';
import { basename, dirname, join } from 'node:path';
import { fingerprint } from './plan-integration-change.js';
import { SetupConflictError, SetupStorageError } from './setup-errors.js';

export async function backupAndAtomicWrite(input: {
  readonly targetPath: string;
  readonly expectedFingerprint: string;
  readonly nextContent: string;
  readonly validate: (content: string) => void;
  readonly now: Date;
}): Promise<{ readonly backupPath: string }> {
  const original = await readFile(input.targetPath).catch((error: unknown) => {
    if (isMissing(error)) return Buffer.from('');
    throw storageError(input.targetPath, error);
  });
  if (fingerprint(original) !== input.expectedFingerprint)
    throw new SetupConflictError(`Configuration changed before replacement: ${input.targetPath}`);
  const mode = await fileMode(input.targetPath);
  const backupPath = await createExclusiveBackup(input.targetPath, input.now, original, mode);
  const tempPath = join(
    dirname(input.targetPath),
    `.${basename(input.targetPath)}.${process.pid}.${randomUUID()}.tmp`,
  );
  let replaced = false;
  try {
    const handle = await open(tempPath, 'wx', mode);
    try {
      await handle.writeFile(input.nextContent, 'utf8');
      await handle.sync();
    } finally {
      await handle.close();
    }
    await chmod(tempPath, mode);
    input.validate(await readFile(tempPath, 'utf8'));
    const current = await readFile(input.targetPath).catch((error: unknown) => {
      if (isMissing(error)) return Buffer.from('');
      throw storageError(input.targetPath, error);
    });
    if (fingerprint(current) !== input.expectedFingerprint)
      throw new SetupConflictError(`Configuration changed before replacement: ${input.targetPath}`);
    await replaceFile(tempPath, input.targetPath);
    replaced = true;
    input.validate(await readFile(input.targetPath, 'utf8'));
    return { backupPath };
  } catch (error) {
    if (replaced) {
      try {
        await restoreFile(backupPath, input.targetPath, mode);
        input.validate(await readFile(input.targetPath, 'utf8'));
      } catch (restoreError) {
        throw new SetupStorageError(
          `Failed to restore ${input.targetPath} from ${backupPath}.`,
          restoreError,
        );
      }
    }
    throw error;
  } finally {
    await unlink(tempPath).catch(() => undefined);
  }
}

export async function restoreFile(
  sourcePath: string,
  targetPath: string,
  mode?: number,
): Promise<void> {
  const source = await readFile(sourcePath);
  const preservedMode = mode ?? (await fileMode(sourcePath));
  const temporaryPath = join(
    dirname(targetPath),
    `.${basename(targetPath)}.${process.pid}.${randomUUID()}.restore.tmp`,
  );
  await writeFile(temporaryPath, source, { flag: 'wx', mode: preservedMode });
  try {
    await chmod(temporaryPath, preservedMode);
    await replaceFile(temporaryPath, targetPath);
  } finally {
    await unlink(temporaryPath).catch(() => undefined);
  }
}

export async function replaceFile(sourcePath: string, targetPath: string): Promise<void> {
  try {
    await rename(sourcePath, targetPath);
  } catch (error) {
    if (!isWindowsReplacementError(error)) throw storageError(targetPath, error);
    const displaced = `${targetPath}.${process.pid}.${randomUUID()}.displaced`;
    try {
      await rename(targetPath, displaced);
    } catch (displaceError) {
      throw storageError(targetPath, displaceError);
    }
    try {
      await rename(sourcePath, targetPath);
    } catch (replaceError) {
      try {
        await rename(displaced, targetPath);
      } catch (restoreError) {
        throw new SetupStorageError(
          `Could not replace ${targetPath} and could not restore its original file.`,
          restoreError,
        );
      }
      throw storageError(targetPath, replaceError);
    }
    await unlink(displaced).catch(() => undefined);
  }
}

async function createExclusiveBackup(
  targetPath: string,
  now: Date,
  contents: Buffer,
  mode: number,
): Promise<string> {
  const stamp = now.toISOString().replaceAll('-', '').replaceAll(':', '');
  const base = `${targetPath}.relay-backup-${stamp}`;
  for (let suffix = 0; suffix < 10_000; suffix += 1) {
    const candidate = suffix === 0 ? base : `${base}-${suffix}`;
    try {
      await writeFile(candidate, contents, { flag: 'wx', mode });
      await chmod(candidate, mode);
      return candidate;
    } catch (error) {
      if (isExists(error)) continue;
      throw storageError(candidate, error);
    }
  }
  throw new SetupStorageError(`Could not allocate a collision-safe backup for ${targetPath}.`);
}

async function fileMode(path: string): Promise<number> {
  try {
    return (await stat(path)).mode & 0o777;
  } catch (error) {
    if (isMissing(error)) return 0o600;
    throw storageError(path, error);
  }
}

function storageError(path: string, cause: unknown): SetupStorageError {
  return new SetupStorageError(
    `Could not safely update ${path}. Check permissions and retry.`,
    cause,
  );
}

function isMissing(error: unknown): boolean {
  return typeof error === 'object' && error !== null && 'code' in error && error.code === 'ENOENT';
}

function isExists(error: unknown): boolean {
  return typeof error === 'object' && error !== null && 'code' in error && error.code === 'EEXIST';
}

function isWindowsReplacementError(error: unknown): boolean {
  return (
    process.platform === 'win32' &&
    typeof error === 'object' &&
    error !== null &&
    'code' in error &&
    (error.code === 'EEXIST' || error.code === 'EPERM')
  );
}
