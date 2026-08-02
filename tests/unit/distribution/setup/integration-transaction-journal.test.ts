import {
  chmodSync,
  existsSync,
  mkdirSync,
  mkdtempSync,
  readFileSync,
  rmSync,
  statSync,
  writeFileSync,
} from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterEach, describe, expect, it } from 'vitest';
import { createCodexTomlAdapter } from '../../../../src/distribution/setup/clients/codex-toml-adapter.js';
import {
  deleteIntegrationTransactionJournal,
  recoverIntegrationTransaction,
  writeIntegrationTransactionJournal,
  type RelayIntegrationTransactionJournal,
} from '../../../../src/distribution/setup/integration-transaction-journal.js';
import type { OwnershipStore } from '../../../../src/distribution/setup/ownership-store.js';
import { fingerprint } from '../../../../src/distribution/setup/plan-integration-change.js';
import type { RelayOwnershipFile } from '../../../../src/distribution/setup/setup-types.js';
import {
  SetupConflictError,
  SetupStorageError,
} from '../../../../src/distribution/setup/setup-errors.js';

function createStore(initial: RelayOwnershipFile): OwnershipStore {
  let current = initial;
  return {
    read: async () => current,
    update: async (mutate) => {
      current = await mutate(current);
      return current;
    },
  };
}

function journalFor(input: {
  configPath: string;
  action?: RelayIntegrationTransactionJournal['action'];
  phase?: RelayIntegrationTransactionJournal['phase'];
  beforeFingerprint?: string;
  nextFingerprint?: string;
  originalExisted?: boolean;
  originalMode?: number;
  backupPath?: string;
}): RelayIntegrationTransactionJournal {
  return {
    schemaVersion: 1,
    client: 'codex',
    configPath: input.configPath,
    entryId: 'relay',
    action: input.action ?? 'setup',
    phase: input.phase ?? 'client-written',
    beforeFingerprint: input.beforeFingerprint ?? fingerprint('before'),
    nextFingerprint: input.nextFingerprint ?? fingerprint('next'),
    originalExisted: input.originalExisted ?? true,
    originalMode: input.originalMode ?? 0o640,
    ...(input.backupPath === undefined ? {} : { backupPath: input.backupPath }),
    applicationVersion: '0.1.0',
    startedAt: '2026-08-02T01:02:03.004Z',
  };
}

describe('integration transaction journal recovery', () => {
  const roots: string[] = [];
  afterEach(() =>
    roots.splice(0).forEach((root) => rmSync(root, { recursive: true, force: true })),
  );

  function createCase(): { root: string; configPath: string; journalPath: string } {
    const root = mkdtempSync(join(tmpdir(), 'relay-transaction-'));
    roots.push(root);
    const configPath = join(root, 'codex.toml');
    return { root, configPath, journalPath: `${configPath}.relay-transaction.json` };
  }

  it('returns none when no journal exists', async () => {
    const { configPath, journalPath } = createCase();
    await expect(
      recoverIntegrationTransaction({
        journalPath,
        configPath,
        adapter: createCodexTomlAdapter(),
        ownershipStore: createStore({ schemaVersion: 1, integrations: [] }),
        applicationVersion: '0.1.0',
      }),
    ).resolves.toBe('none');
  });

  it('fails closed and retains a malformed journal', async () => {
    const { configPath, journalPath } = createCase();
    writeFileSync(journalPath, '{"schemaVersion":99}');
    await expect(
      recoverIntegrationTransaction({
        journalPath,
        configPath,
        adapter: createCodexTomlAdapter(),
        ownershipStore: createStore({ schemaVersion: 1, integrations: [] }),
        applicationVersion: '0.1.0',
      }),
    ).rejects.toMatchObject({
      message: expect.stringContaining(journalPath),
    });
    await expect(
      recoverIntegrationTransaction({
        journalPath,
        configPath,
        adapter: createCodexTomlAdapter(),
        ownershipStore: createStore({ schemaVersion: 1, integrations: [] }),
        applicationVersion: '0.1.0',
      }),
    ).rejects.toThrow(/do not edit/i);
    expect(existsSync(journalPath)).toBe(true);
  });

  it('deletes a prepared journal when the client still has the before fingerprint', async () => {
    const { configPath, journalPath } = createCase();
    const before = '[profile]\nname = "before"\n';
    writeFileSync(configPath, before);
    await writeIntegrationTransactionJournal(
      journalPath,
      journalFor({
        configPath,
        phase: 'prepared',
        beforeFingerprint: fingerprint(before),
      }),
    );
    await expect(
      recoverIntegrationTransaction({
        journalPath,
        configPath,
        adapter: createCodexTomlAdapter(),
        ownershipStore: createStore({ schemaVersion: 1, integrations: [] }),
        applicationVersion: '0.1.0',
      }),
    ).resolves.toBe('rolled-back');
    expect(readFileSync(configPath, 'utf8')).toBe(before);
    expect(existsSync(journalPath)).toBe(false);
  });

  it('treats a prepared journal with the next fingerprint as client-written recovery', async () => {
    const { configPath, journalPath } = createCase();
    const before = '[profile]\nname = "before"\n';
    const next = `${before}\n[mcp_servers.relay]\ncommand = "relay"\nargs = ["mcp"]\n`;
    const backupPath = join(createCase().root, 'backup.toml');
    writeFileSync(configPath, next);
    writeFileSync(backupPath, before);
    await writeIntegrationTransactionJournal(
      journalPath,
      journalFor({
        configPath,
        phase: 'prepared',
        beforeFingerprint: fingerprint(before),
        nextFingerprint: fingerprint(next),
        backupPath,
      }),
    );
    await expect(
      recoverIntegrationTransaction({
        journalPath,
        configPath,
        adapter: createCodexTomlAdapter(),
        ownershipStore: createStore({ schemaVersion: 1, integrations: [] }),
        applicationVersion: '0.1.0',
      }),
    ).resolves.toBe('rolled-back');
    expect(readFileSync(configPath, 'utf8')).toBe(before);
  });

  it('returns conflict for an unrelated prepared fingerprint and preserves state', async () => {
    const { configPath, journalPath } = createCase();
    const unrelated = '[profile]\nname = "unrelated"\n';
    writeFileSync(configPath, unrelated);
    await writeIntegrationTransactionJournal(
      journalPath,
      journalFor({ configPath, phase: 'prepared' }),
    );
    await expect(
      recoverIntegrationTransaction({
        journalPath,
        configPath,
        adapter: createCodexTomlAdapter(),
        ownershipStore: createStore({ schemaVersion: 1, integrations: [] }),
        applicationVersion: '0.1.0',
      }),
    ).rejects.toBeInstanceOf(SetupConflictError);
    expect(existsSync(journalPath)).toBe(true);
    expect(readFileSync(configPath, 'utf8')).toBe(unrelated);
  });

  it.each([
    ['setup', 'enabled'],
    ['disable', 'disabled'],
  ] as const)(
    'completes a client-written %s journal when ownership matches',
    async (action, status) => {
      const { configPath, journalPath } = createCase();
      writeFileSync(configPath, '');
      await writeIntegrationTransactionJournal(
        journalPath,
        journalFor({ configPath, action, nextFingerprint: fingerprint('') }),
      );
      const store = createStore({
        schemaVersion: 1,
        integrations: [
          {
            client: 'codex',
            configPath,
            entryId: 'relay',
            command: 'relay',
            args: ['mcp'],
            status,
            applicationVersion: '0.1.0',
            lastSuccessfulSetupAt: '2026-08-02T01:02:03.004Z',
          },
        ],
      });
      await expect(
        recoverIntegrationTransaction({
          journalPath,
          configPath,
          adapter: createCodexTomlAdapter(),
          ownershipStore: store,
          applicationVersion: '0.1.0',
        }),
      ).resolves.toBe('completed');
      expect(existsSync(journalPath)).toBe(false);
    },
  );

  it('completes a client-written remove journal when ownership is absent', async () => {
    const { configPath, journalPath } = createCase();
    writeFileSync(configPath, '');
    await writeIntegrationTransactionJournal(
      journalPath,
      journalFor({ configPath, action: 'remove', nextFingerprint: fingerprint('') }),
    );
    await expect(
      recoverIntegrationTransaction({
        journalPath,
        configPath,
        adapter: createCodexTomlAdapter(),
        ownershipStore: createStore({ schemaVersion: 1, integrations: [] }),
        applicationVersion: '0.1.0',
      }),
    ).resolves.toBe('completed');
    expect(existsSync(journalPath)).toBe(false);
  });

  it('fails closed when matching ownership exists but the client file changed externally', async () => {
    const { root, configPath, journalPath } = createCase();
    const external = '[profile]\nname = "external"\n';
    const backupPath = join(root, 'codex.toml.relay-backup');
    writeFileSync(configPath, external);
    writeFileSync(backupPath, '[profile]\nname = "before"\n');
    const ownership = {
      schemaVersion: 1 as const,
      integrations: [
        {
          client: 'codex' as const,
          configPath,
          entryId: 'relay' as const,
          command: 'relay' as const,
          args: ['mcp'] as const,
          status: 'enabled' as const,
          applicationVersion: '0.1.0',
          lastSuccessfulSetupAt: '2026-08-02T01:02:03.004Z',
        },
      ],
    };
    const store = createStore(ownership);
    await writeIntegrationTransactionJournal(
      journalPath,
      journalFor({ configPath, backupPath, nextFingerprint: fingerprint('next') }),
    );

    await expect(
      recoverIntegrationTransaction({
        journalPath,
        configPath,
        adapter: createCodexTomlAdapter(),
        ownershipStore: store,
        applicationVersion: '0.1.0',
      }),
    ).rejects.toBeInstanceOf(SetupConflictError);
    expect(readFileSync(configPath, 'utf8')).toBe(external);
    expect(existsSync(journalPath)).toBe(true);
    expect(existsSync(backupPath)).toBe(true);
    await expect(store.read()).resolves.toEqual(ownership);
  });

  it('fails closed when ownership is missing and the client file changed externally', async () => {
    const { root, configPath, journalPath } = createCase();
    const external = '[profile]\nname = "external"\n';
    const backup = '[profile]\nname = "before"\n';
    const backupPath = join(root, 'codex.toml.relay-backup');
    writeFileSync(configPath, external);
    writeFileSync(backupPath, backup);
    const store = createStore({ schemaVersion: 1, integrations: [] });
    await writeIntegrationTransactionJournal(
      journalPath,
      journalFor({ configPath, backupPath, nextFingerprint: fingerprint('next') }),
    );

    await expect(
      recoverIntegrationTransaction({
        journalPath,
        configPath,
        adapter: createCodexTomlAdapter(),
        ownershipStore: store,
        applicationVersion: '0.1.0',
      }),
    ).rejects.toMatchObject({
      constructor: SetupConflictError,
      message: expect.stringContaining(configPath),
    });
    expect(readFileSync(configPath, 'utf8')).toBe(external);
    expect(existsSync(journalPath)).toBe(true);
    expect(readFileSync(backupPath, 'utf8')).toBe(backup);
    await expect(store.read()).resolves.toEqual({ schemaVersion: 1, integrations: [] });
  });

  it('fails closed when a no-content-change transaction target changed externally', async () => {
    const { configPath, journalPath } = createCase();
    const external = '[profile]\nname = "external"\n';
    writeFileSync(configPath, external);
    await writeIntegrationTransactionJournal(
      journalPath,
      journalFor({
        configPath,
        beforeFingerprint: fingerprint('same'),
        nextFingerprint: fingerprint('same'),
      }),
    );

    await expect(
      recoverIntegrationTransaction({
        journalPath,
        configPath,
        adapter: createCodexTomlAdapter(),
        ownershipStore: createStore({ schemaVersion: 1, integrations: [] }),
        applicationVersion: '0.1.0',
      }),
    ).rejects.toMatchObject({
      constructor: SetupConflictError,
      message: expect.stringMatching(/journal|config/i),
    });
    expect(readFileSync(configPath, 'utf8')).toBe(external);
    expect(existsSync(journalPath)).toBe(true);
  });

  it('restores an existing client file byte-for-byte and preserves its mode', async () => {
    const { configPath, journalPath } = createCase();
    const before = '[profile]\r\nname = "before"\r\n';
    const next = `${before}\r\n[mcp_servers.relay]\r\ncommand = "relay"\r\nargs = ["mcp"]\r\n`;
    const backupPath = join(journalPath, '..', 'codex.toml.relay-backup');
    writeFileSync(configPath, next);
    writeFileSync(backupPath, before);
    chmodSync(backupPath, 0o640);
    const originalMode = statSync(backupPath).mode & 0o777;
    await writeIntegrationTransactionJournal(
      journalPath,
      journalFor({
        configPath,
        beforeFingerprint: fingerprint(before),
        nextFingerprint: fingerprint(next),
        backupPath,
        originalMode,
      }),
    );
    await expect(
      recoverIntegrationTransaction({
        journalPath,
        configPath,
        adapter: createCodexTomlAdapter(),
        ownershipStore: createStore({ schemaVersion: 1, integrations: [] }),
        applicationVersion: '0.1.0',
      }),
    ).resolves.toBe('rolled-back');
    expect(readFileSync(configPath)).toEqual(Buffer.from(before));
    expect(statSync(configPath).mode & 0o777).toBe(originalMode);
    expect(existsSync(backupPath)).toBe(true);
  });

  it('removes an originally absent client file during rollback', async () => {
    const { configPath, journalPath } = createCase();
    const next = '[mcp_servers.relay]\ncommand = "relay"\nargs = ["mcp"]\n';
    writeFileSync(configPath, next);
    await writeIntegrationTransactionJournal(
      journalPath,
      journalFor({
        configPath,
        originalExisted: false,
        originalMode: 0o600,
        beforeFingerprint: fingerprint(''),
        nextFingerprint: fingerprint(next),
      }),
    );
    await expect(
      recoverIntegrationTransaction({
        journalPath,
        configPath,
        adapter: createCodexTomlAdapter(),
        ownershipStore: createStore({ schemaVersion: 1, integrations: [] }),
        applicationVersion: '0.1.0',
      }),
    ).resolves.toBe('rolled-back');
    expect(existsSync(configPath)).toBe(false);
  });

  it('retains the journal and backup when restoration fails', async () => {
    const { configPath, journalPath } = createCase();
    const backupPath = join(journalPath, '..', 'codex.toml.relay-backup');
    mkdirSync(configPath);
    writeFileSync(backupPath, 'before');
    await writeIntegrationTransactionJournal(
      journalPath,
      journalFor({ configPath, backupPath, originalExisted: true }),
    );
    await expect(
      recoverIntegrationTransaction({
        journalPath,
        configPath,
        adapter: createCodexTomlAdapter(),
        ownershipStore: createStore({ schemaVersion: 1, integrations: [] }),
        applicationVersion: '0.1.0',
      }),
    ).rejects.toMatchObject({ constructor: SetupStorageError });
    expect(existsSync(journalPath)).toBe(true);
    expect(existsSync(backupPath)).toBe(true);
  });

  it('deletes a journal atomically when explicitly requested', async () => {
    const { configPath, journalPath } = createCase();
    await writeIntegrationTransactionJournal(journalPath, journalFor({ configPath }));
    await deleteIntegrationTransactionJournal(journalPath);
    expect(existsSync(journalPath)).toBe(false);
  });
});
