import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import type Database from 'better-sqlite3';
import { createDatabaseConnection } from '../../src/database/connection.js';
import { runMigrations } from '../../src/database/migrate.js';

export interface TemporaryDatabaseContext {
  readonly dir: string;
  readonly dbPath: string;
  readonly db: Database.Database;
  readonly cleanup: () => void;
}

export function createTemporaryDatabase(): TemporaryDatabaseContext {
  const dir = mkdtempSync(join(tmpdir(), 'relay-test-'));
  const dbPath = join(dir, 'test.db');
  const db = createDatabaseConnection({ path: dbPath });

  const cleanup = () => {
    try {
      db.close();
    } catch {
      // ignore
    }
    rmSync(dir, { recursive: true, force: true });
  };

  return { dir, dbPath, db, cleanup };
}

export function createMigratedTemporaryDatabase(): TemporaryDatabaseContext {
  const context = createTemporaryDatabase();
  runMigrations(context.db);
  return context;
}
