import { randomUUID } from 'node:crypto';
import { mkdir, readFile, unlink, writeFile } from 'node:fs/promises';
import { dirname, normalize, resolve } from 'node:path';
import { replaceFile } from './backup-and-atomic-write.js';
import type { RelayIntegrationOwnership, RelayOwnershipFile } from './setup-types.js';
import { SetupStorageError } from './setup-errors.js';

export interface OwnershipStore {
  read(): Promise<RelayOwnershipFile>;
  write(next: RelayOwnershipFile): Promise<void>;
}

export function createOwnershipStore(input: {
  readonly metadataPath: string;
  readonly applicationVersion: string;
}): OwnershipStore {
  return {
    read: async () => {
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
    },
    write: async (next) => {
      let validated: RelayOwnershipFile;
      try {
        validated = validateOwnership(next, input.applicationVersion);
        await mkdir(dirname(input.metadataPath), { recursive: true });
      } catch (error) {
        throw new SetupStorageError(
          `Relay ownership metadata could not be prepared at ${input.metadataPath}.`,
          error,
        );
      }
      const temporaryPath = `${input.metadataPath}.${process.pid}.${randomUUID()}.tmp`;
      try {
        await writeFile(temporaryPath, `${JSON.stringify(validated, null, 2)}\n`, 'utf8');
        await replaceFile(temporaryPath, input.metadataPath);
      } catch (error) {
        await unlink(temporaryPath).catch(() => undefined);
        throw new SetupStorageError(
          `Relay ownership metadata could not be written at ${input.metadataPath}.`,
          error,
        );
      }
    },
  };
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
