import { existsSync } from 'node:fs';
import type Database from 'better-sqlite3';
import { loadMigrationFiles } from '../../database/migration.js';
import type { DoctorCheck } from './doctor-types.js';

export interface DatabaseDiagnosticState {
  readonly exists: boolean;
  readonly appliedMigrations: readonly string[];
  readonly availableMigrations: readonly string[];
  readonly pendingMigrations: readonly string[];
  readonly unknownMigrations: readonly string[];
}

export function inspectDatabaseReadOnly(input: {
  readonly databasePath: string;
  readonly migrationsDir: string;
  readonly openReadOnly: (path: string) => Database.Database;
}): DatabaseDiagnosticState {
  if (!existsSync(input.databasePath)) {
    return {
      exists: false,
      appliedMigrations: [],
      availableMigrations: loadMigrationFiles(input.migrationsDir).map(
        (migration) => migration.filename,
      ),
      pendingMigrations: [],
      unknownMigrations: [],
    };
  }
  const available = loadMigrationFiles(input.migrationsDir);
  const availableByVersion = new Map(available.map((migration) => [migration.version, migration]));
  const db = input.openReadOnly(input.databasePath);
  try {
    const rows = db
      .prepare('SELECT version, name, checksum FROM _relay_migrations ORDER BY version ASC')
      .all() as Array<{ version: number; name: string; checksum: string }>;
    const applied = rows.map((row) => `${String(row.version).padStart(4, '0')}_${row.name}.sql`);
    const unknown: string[] = [];
    for (const row of rows) {
      const expected = availableByVersion.get(row.version);
      if (
        expected === undefined ||
        expected.name !== row.name ||
        expected.checksum !== row.checksum
      ) {
        unknown.push(`${String(row.version).padStart(4, '0')}_${row.name}.sql`);
      }
    }
    const appliedVersions = new Set(rows.map((row) => row.version));
    const pending = available
      .filter((migration) => !appliedVersions.has(migration.version))
      .map((migration) => migration.filename);
    return {
      exists: true,
      appliedMigrations: applied,
      availableMigrations: available.map((migration) => migration.filename),
      pendingMigrations: pending,
      unknownMigrations: unknown,
    };
  } finally {
    db.close();
  }
}

export function createDatabaseStateCheck(input: {
  readonly databasePath: string;
  readonly migrationsDir: string;
  readonly openReadOnly: (path: string) => Database.Database;
}): DoctorCheck {
  return {
    id: 'database.state',
    run: async () => {
      try {
        const state = inspectDatabaseReadOnly(input);
        if (!state.exists) {
          return {
            status: 'warning',
            code: 'database.missing',
            message: 'The configured Relay database does not exist yet.',
          };
        }
        if (state.unknownMigrations.length > 0) {
          return {
            status: 'failure',
            code: 'database.unknown-migrations',
            message: 'The configured Relay database contains unknown or changed migrations.',
            details: { migrations: state.unknownMigrations },
          };
        }
        if (state.pendingMigrations.length > 0) {
          return {
            status: 'failure',
            code: 'database.pending-migrations',
            message: 'The configured Relay database has pending migrations.',
            details: { migrations: state.pendingMigrations },
          };
        }
        return {
          status: 'healthy',
          code: 'database.current',
          message: 'The configured Relay database has the current migration ledger.',
          details: { migrations: state.appliedMigrations },
        };
      } catch (error) {
        if (isMissing(error)) {
          return {
            status: 'warning',
            code: 'database.missing',
            message: 'The configured Relay database does not exist yet.',
          };
        }
        return {
          status: 'failure',
          code: 'database.read-failed',
          message: 'The configured Relay database could not be inspected safely.',
        };
      }
    },
  };
}

export function createDatabaseIntegrityCheck(input: {
  readonly databasePath: string;
  readonly openReadOnly: (path: string) => Database.Database;
}): DoctorCheck {
  return {
    id: 'database.integrity',
    run: async () => {
      if (!existsSync(input.databasePath)) {
        return {
          status: 'skipped',
          code: 'database.integrity-skipped',
          message: 'SQLite integrity was skipped because the configured database does not exist.',
        };
      }
      let db: Database.Database | undefined;
      try {
        db = input.openReadOnly(input.databasePath);
        const rows = db.prepare('PRAGMA quick_check').all() as Array<{ quick_check?: string }>;
        if (rows.length === 1 && rows[0]?.quick_check === 'ok') {
          return {
            status: 'healthy',
            code: 'database.integrity-ok',
            message: 'SQLite integrity check passed.',
          };
        }
        return {
          status: 'failure',
          code: 'database.integrity-failed',
          message: 'SQLite integrity check failed.',
        };
      } catch {
        return {
          status: 'failure',
          code: 'database.integrity-unavailable',
          message: 'SQLite integrity could not be checked safely.',
        };
      } finally {
        db?.close();
      }
    },
  };
}

export function createNativeAddonCheck(input: {
  readonly openProbe: () => Database.Database;
  readonly nodeAbi: string;
  readonly packageVersion: string;
}): DoctorCheck {
  return {
    id: 'database.native-addon',
    run: async () => {
      let db: Database.Database | undefined;
      try {
        db = input.openProbe();
        return {
          status: 'healthy',
          code: 'database.native-addon-loaded',
          message: 'The better-sqlite3 native addon loaded successfully.',
        };
      } catch {
        return {
          status: 'failure',
          code: 'database.native-addon-load-failed',
          message: 'The better-sqlite3 native addon could not be loaded.',
          details: { nodeAbi: input.nodeAbi, packageVersion: input.packageVersion },
        };
      } finally {
        db?.close();
      }
    },
  };
}

function isMissing(error: unknown): boolean {
  return (
    typeof error === 'object' &&
    error !== null &&
    'code' in error &&
    error.code === 'SQLITE_CANTOPEN'
  );
}
