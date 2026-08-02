import { createHash } from 'node:crypto';
import { readFile } from 'node:fs/promises';
import { isAbsolute, normalize, resolve } from 'node:path';
import type { ClientConfigAdapter } from './clients/client-adapter.js';
import {
  SetupConflictError,
  SetupNotFoundError,
  SetupStorageError,
  SetupUsageError,
} from './setup-errors.js';
import type {
  IntegrationChangePlan,
  MutableIntegrationClient,
  RelayOwnershipFile,
} from './setup-types.js';

export async function planIntegrationChange(input: {
  readonly action: 'setup' | 'disable' | 'remove';
  readonly client: MutableIntegrationClient;
  readonly configPath: string;
  readonly adapter: ClientConfigAdapter;
  readonly ownership: RelayOwnershipFile;
}): Promise<IntegrationChangePlan> {
  assertAbsoluteConfigPath(input.configPath);
  const configPath = normalize(resolve(input.configPath));
  const content = await readClientFile(configPath);
  const state = input.adapter.inspect(content);
  const ownership = input.ownership.integrations.find(
    (record) => record.client === input.client && samePath(record.configPath, configPath),
  );
  const otherOwnership = input.ownership.integrations.find(
    (record) => record.client !== input.client && samePath(record.configPath, configPath),
  );
  if (otherOwnership !== undefined)
    throw new SetupConflictError('Relay ownership belongs to another client.');
  if (state.kind === 'conflicting')
    throw new SetupConflictError('The configuration contains a conflicting relay entry.');

  let operation: IntegrationChangePlan['operation'];
  let nextContent = content;
  if (input.action === 'setup') {
    if (state.kind === 'matching' && ownership?.status === 'enabled') operation = 'unchanged';
    else if (state.kind === 'matching' && ownership?.status === 'disabled') operation = 'updated';
    else if (state.kind === 'matching')
      throw new SetupConflictError('A matching relay entry is not Relay-owned.');
    else if (ownership?.status === 'enabled')
      throw new SetupConflictError('Relay ownership exists but its entry is missing.');
    else {
      operation = 'created';
      nextContent = input.adapter.upsertRelayEntry(content);
    }
  } else if (input.action === 'disable') {
    if (ownership?.status !== 'enabled')
      throw new SetupNotFoundError('No enabled Relay integration owns this entry.');
    if (state.kind !== 'matching')
      throw new SetupConflictError('The owned relay entry is not present or no longer matches.');
    operation = 'disabled';
    nextContent = input.adapter.removeRelayEntry(content);
  } else {
    if (ownership === undefined)
      throw new SetupNotFoundError('No Relay ownership record exists for this entry.');
    if (state.kind === 'matching') {
      operation = 'removed';
      nextContent = input.adapter.removeRelayEntry(content);
    } else if (ownership.status === 'disabled') {
      operation = 'removed';
    } else {
      throw new SetupConflictError('The owned relay entry is not present or no longer matches.');
    }
  }

  return {
    client: input.client,
    configPath,
    entryId: 'relay',
    operation,
    changed:
      nextContent !== content ||
      (operation === 'updated' && ownership?.status === 'disabled') ||
      (operation === 'removed' && ownership?.status === 'disabled'),
    beforeFingerprint: fingerprint(content),
    nextContent,
    snippet: input.adapter.renderSnippet(),
  };
}

async function readClientFile(path: string): Promise<string> {
  try {
    return await readFile(path, 'utf8');
  } catch (error) {
    if (isMissing(error)) return '';
    throw new SetupStorageError(`Could not read configuration at ${path}.`, error);
  }
}

export function fingerprint(content: string | Buffer): string {
  return createHash('sha256').update(content).digest('hex');
}

function samePath(left: string, right: string): boolean {
  const normalizedLeft = normalize(resolve(left));
  const normalizedRight = normalize(resolve(right));
  return process.platform === 'win32'
    ? normalizedLeft.toLowerCase() === normalizedRight.toLowerCase()
    : normalizedLeft === normalizedRight;
}

function isMissing(error: unknown): boolean {
  return typeof error === 'object' && error !== null && 'code' in error && error.code === 'ENOENT';
}

export function assertAbsoluteConfigPath(configPath: string): void {
  if (!isAbsolute(configPath)) throw new SetupUsageError('Configuration path must be absolute.');
}
