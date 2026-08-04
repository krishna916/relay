import { createHash } from 'node:crypto';
import { readdirSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import { RelayError } from '../shared/errors.js';

export interface MigrationFile {
  readonly version: number;
  readonly name: string;
  readonly filename: string;
  readonly sql: string;
  readonly checksum: string;
}

export interface MigrationManifestEntry {
  readonly version: number;
  readonly name: string;
  readonly filename: string;
}

export function computeChecksum(content: string): string {
  return createHash('sha256').update(content, 'utf-8').digest('hex');
}

export function loadMigrationFiles(migrationsDir: string): readonly MigrationFile[] {
  const manifest = loadMigrationManifest(migrationsDir);
  return manifest.map((entry) => {
    const sql = readFileSync(join(migrationsDir, entry.filename), 'utf-8');
    return { ...entry, sql, checksum: computeChecksum(sql) };
  });
}

export function loadMigrationManifest(migrationsDir: string): readonly MigrationManifestEntry[] {
  const entries = readdirSync(migrationsDir, { withFileTypes: true });
  const files: MigrationFile[] = [];
  const seenVersions = new Set<number>();

  for (const entry of entries) {
    if (!entry.isFile() || !entry.name.endsWith('.sql')) continue;

    const match = /^(\d{4})_(.+)\.sql$/.exec(entry.name);
    if (!match) {
      throw new RelayError(
        `Malformed migration filename: ${entry.name}. Expected format: NNNN_description.sql`,
      );
    }

    const versionStr = match[1];
    const name = match[2];
    if (!versionStr || !name) continue;

    const version = parseInt(versionStr, 10);
    if (seenVersions.has(version)) {
      throw new RelayError(`Duplicate migration version prefix: ${versionStr}`);
    }
    seenVersions.add(version);

    files.push({ version, name, filename: entry.name, sql: '', checksum: '' });
  }

  return files
    .sort((a, b) => a.version - b.version)
    .map(({ version, name, filename }) => ({ version, name, filename }));
}
