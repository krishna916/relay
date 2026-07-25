import Database from 'better-sqlite3';
import { mkdirSync } from 'node:fs';
import { dirname } from 'node:path';
import { resolveDatabasePath } from './database-config.js';

export interface DatabaseConnectionOptions {
  readonly path?: string;
  readonly readonly?: boolean;
}

export function createDatabaseConnection(
  options: DatabaseConnectionOptions = {},
): Database.Database {
  const dbPath = resolveDatabasePath(options.path);

  if (dbPath !== ':memory:') {
    mkdirSync(dirname(dbPath), { recursive: true });
  }

  const db = new Database(dbPath, { readonly: options.readonly ?? false });

  db.pragma('foreign_keys = ON');
  db.pragma('journal_mode = WAL');
  db.pragma('busy_timeout = 5000');

  return db;
}
