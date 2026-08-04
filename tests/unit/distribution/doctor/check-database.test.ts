import Database from 'better-sqlite3';
import {
  createDatabaseIntegrityCheck,
  createDatabaseStateCheck,
  createNativeAddonCheck,
  inspectDatabaseReadOnly,
} from '../../../../src/distribution/doctor/check-database.js';
import { describe, expect, it } from 'vitest';
import { mkdtempSync, mkdirSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { tmpdir } from 'node:os';

describe('doctor database checks', () => {
  it('reports a missing database without creating it', async () => {
    const root = mkdtempSync(join(tmpdir(), 'relay-doctor-db-'));
    const databasePath = join(root, 'data', 'relay.db');
    try {
      const result = await createDatabaseStateCheck({
        databasePath,
        migrationsDir: root,
        openReadOnly: (path) => new Database(path, { readonly: true, fileMustExist: true }),
      }).run();
      expect(result).toMatchObject({ status: 'warning', code: 'database.missing' });
    } finally {
      expect(() => new Database(databasePath)).toThrow();
      rmSync(root, { recursive: true, force: true });
    }
  });

  it('skips integrity when the configured database is absent', async () => {
    const result = await createDatabaseIntegrityCheck({
      databasePath: join(tmpdir(), 'relay-doctor-missing-integrity.db'),
      openReadOnly: () => {
        throw new Error('must not open a missing database');
      },
    }).run();
    expect(result).toMatchObject({ status: 'skipped', code: 'database.integrity-skipped' });
  });

  it('reports pending migrations from the read-only ledger inspection', async () => {
    const root = mkdtempSync(join(tmpdir(), 'relay-doctor-db-'));
    const migrationsDir = join(root, 'migrations');
    const databasePath = join(root, 'relay.db');
    mkdirSync(migrationsDir);
    const migration = 'CREATE TABLE example (id INTEGER PRIMARY KEY);\n';
    writeFileSync(join(migrationsDir, '0001_example.sql'), migration);
    const db = new Database(databasePath);
    db.exec(
      'CREATE TABLE _relay_migrations (version INTEGER PRIMARY KEY, name TEXT NOT NULL, checksum TEXT NOT NULL, applied_at TEXT NOT NULL);',
    );
    db.close();
    const before = Buffer.from(readFileSync(databasePath));
    try {
      const state = inspectDatabaseReadOnly({
        databasePath,
        migrationsDir,
        openReadOnly: (path) => new Database(path, { readonly: true, fileMustExist: true }),
      });
      expect(state.pendingMigrations).toEqual(['0001_example.sql']);
      const result = await createDatabaseStateCheck({
        databasePath,
        migrationsDir,
        openReadOnly: (path) => new Database(path, { readonly: true, fileMustExist: true }),
      }).run();
      expect(result).toMatchObject({ status: 'failure', code: 'database.pending-migrations' });
      expect(Buffer.from(readFileSync(databasePath))).toEqual(before);
    } finally {
      rmSync(root, { recursive: true, force: true });
    }
  });

  it('sanitizes failed quick checks and native addon load failures', async () => {
    const brokenDatabase = {
      prepare: () => ({ all: () => [{ quick_check: 'page 7 is corrupt' }] }),
      close: () => undefined,
      readonly: true,
    } as never;
    const integrity = await createDatabaseIntegrityCheck({
      databasePath: process.execPath,
      openReadOnly: () => brokenDatabase,
    }).run();
    expect(integrity).toMatchObject({ status: 'failure', code: 'database.integrity-failed' });
    expect(JSON.stringify(integrity)).not.toContain('page 7');

    const addon = await createNativeAddonCheck({
      openProbe: () => {
        throw new Error('ABI stack trace');
      },
      nodeAbi: '137',
      packageVersion: '13.0.1',
    }).run();
    expect(addon).toMatchObject({ status: 'failure', code: 'database.native-addon-load-failed' });
    expect(addon.details).toEqual({ nodeAbi: '137', packageVersion: '13.0.1' });
    expect(JSON.stringify(addon)).not.toContain('ABI stack trace');
  });

  it('loads the native addon through an isolated in-memory probe', async () => {
    let openedPath: string | undefined;
    const result = await createNativeAddonCheck({
      openProbe: () => {
        openedPath = ':memory:';
        return { close: () => undefined } as never;
      },
      nodeAbi: '137',
      packageVersion: '13.0.1',
    }).run();
    expect(result.status).toBe('healthy');
    expect(openedPath).toBe(':memory:');
  });

  it('accepts a healthy quick check', async () => {
    const healthy = {
      prepare: () => ({ all: () => [{ quick_check: 'ok' }] }),
      close: () => undefined,
      readonly: true,
    } as never;
    await expect(
      createDatabaseIntegrityCheck({
        databasePath: process.execPath,
        openReadOnly: () => healthy,
      }).run(),
    ).resolves.toMatchObject({
      status: 'healthy',
      code: 'database.integrity-ok',
    });
  });
});
