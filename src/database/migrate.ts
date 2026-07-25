import type Database from 'better-sqlite3';
import { loadMigrationFiles } from './migration.js';
import { RelayError } from '../shared/errors.js';
import { resolveFromPackageRoot } from '../shared/runtime-paths.js';

export interface MigrationOptions {
  readonly migrationsDir?: string;
}

export function runMigrations(db: Database.Database, options: MigrationOptions = {}): void {
  const migrationsDir =
    options.migrationsDir || resolveFromPackageRoot('src', 'database', 'migrations');

  db.exec(`
    CREATE TABLE IF NOT EXISTS _relay_migrations (
      version INTEGER PRIMARY KEY,
      name TEXT NOT NULL,
      checksum TEXT NOT NULL,
      applied_at TEXT NOT NULL
    );
  `);

  const appliedRows = db
    .prepare('SELECT version, name, checksum FROM _relay_migrations ORDER BY version ASC')
    .all() as {
    version: number;
    name: string;
    checksum: string;
  }[];

  const appliedMap = new Map(appliedRows.map((r) => [r.version, r]));
  const migrationFiles = loadMigrationFiles(migrationsDir);

  for (const file of migrationFiles) {
    const applied = appliedMap.get(file.version);
    if (applied) {
      if (applied.checksum !== file.checksum || applied.name !== file.name) {
        throw new RelayError(
          `Migration mismatch for version ${file.version} (${file.filename}). ` +
            `Applied checksum/name does not match repository SQL file. Applied SQL files are immutable.`,
        );
      }
      continue;
    }

    const applyTransaction = db.transaction(() => {
      db.exec(file.sql);
      db.prepare(
        `INSERT INTO _relay_migrations (version, name, checksum, applied_at) VALUES (?, ?, ?, CURRENT_TIMESTAMP)`,
      ).run(file.version, file.name, file.checksum);
    });

    applyTransaction();
  }
}
