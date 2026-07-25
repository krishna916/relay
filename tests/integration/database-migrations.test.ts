import { describe, it, expect, afterEach } from 'vitest';
import { writeFileSync, mkdirSync } from 'node:fs';
import { join } from 'node:path';
import { createTemporaryDatabase } from '../support/temporary-database.js';
import { runMigrations } from '../../src/database/migrate.js';
import { RelayError } from '../../src/shared/errors.js';

describe('database-migrations integration', () => {
  let tempDb: ReturnType<typeof createTemporaryDatabase> | null = null;

  afterEach(() => {
    tempDb?.cleanup();
    tempDb = null;
  });

  it('runs migrations on a fresh temporary SQLite database and verifies PRAGMAs', () => {
    tempDb = createTemporaryDatabase();
    const { db } = tempDb;

    runMigrations(db);

    const fk = db.pragma('foreign_keys', { simple: true });
    const jm = db.pragma('journal_mode', { simple: true });
    const bt = db.pragma('busy_timeout', { simple: true });

    expect(fk).toBe(1);
    expect(jm).toBe('wal');
    expect(bt).toBe(5000);

    const migrations = db.prepare('SELECT version, name FROM _relay_migrations').all() as {
      version: number;
      name: string;
    }[];
    expect(migrations).toHaveLength(1);
    expect(migrations[0]?.version).toBe(1);
    expect(migrations[0]?.name).toBe('scaffold');

    // Verify relay_metadata table scaffolded by 0001_scaffold.sql
    const meta = db.prepare('SELECT key, value FROM relay_metadata WHERE key = ?').get('schema_version') as {
      key: string;
      value: string;
    };
    expect(meta).toEqual({ key: 'schema_version', value: '1' });

    // Idempotence test
    expect(() => runMigrations(db)).not.toThrow();
  });

  it('detects migration file tampering and throws RelayError', () => {
    tempDb = createTemporaryDatabase();
    const { db, dir } = tempDb;

    // Custom migrations directory inside temp dir
    const migrationsDir = join(dir, 'migrations');
    mkdirSync(migrationsDir, { recursive: true });

    const sqlPath = join(migrationsDir, '0001_initial.sql');
    writeFileSync(sqlPath, 'CREATE TABLE test_table (id INT PRIMARY KEY);');

    // Run first time
    runMigrations(db, { migrationsDir });

    // Tamper with the migration SQL file
    writeFileSync(sqlPath, 'CREATE TABLE test_table (id INT PRIMARY KEY, name TEXT);');

    // Attempting re-migration must fail due to SHA-256 mismatch
    expect(() => runMigrations(db, { migrationsDir })).toThrow(RelayError);
    expect(() => runMigrations(db, { migrationsDir })).toThrow(/Migration mismatch/);
  });
});
