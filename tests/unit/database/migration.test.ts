import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { computeChecksum, loadMigrationFiles } from '../../../src/database/migration.js';

describe('migration unit tests', () => {
  let tempDir: string;

  beforeEach(() => {
    tempDir = mkdtempSync(join(tmpdir(), 'relay-migration-test-'));
  });

  afterEach(() => {
    rmSync(tempDir, { recursive: true, force: true });
  });

  describe('computeChecksum', () => {
    it('computes deterministic sha256 checksum for string content', () => {
      const hash1 = computeChecksum('SELECT 1;');
      const hash2 = computeChecksum('SELECT 1;');
      const hash3 = computeChecksum('SELECT 2;');

      expect(hash1).toBe(hash2);
      expect(hash1).not.toBe(hash3);
      expect(hash1).toHaveLength(64);
    });
  });

  describe('loadMigrationFiles', () => {
    it('loads and sorts migration files by version number', () => {
      writeFileSync(join(tempDir, '0002_second.sql'), 'SELECT 2;');
      writeFileSync(join(tempDir, '0001_first.sql'), 'SELECT 1;');

      const files = loadMigrationFiles(tempDir);

      expect(files).toHaveLength(2);
      expect(files[0]?.version).toBe(1);
      expect(files[0]?.name).toBe('first');
      expect(files[0]?.filename).toBe('0001_first.sql');
      expect(files[0]?.checksum).toBe(computeChecksum('SELECT 1;'));

      expect(files[1]?.version).toBe(2);
      expect(files[1]?.name).toBe('second');
    });

    it('ignores non-sql files', () => {
      writeFileSync(join(tempDir, '0001_first.sql'), 'SELECT 1;');
      writeFileSync(join(tempDir, 'README.md'), '# Notes');

      const files = loadMigrationFiles(tempDir);
      expect(files).toHaveLength(1);
    });

    it('throws RelayError for malformed migration filenames', () => {
      writeFileSync(join(tempDir, 'invalid.sql'), 'SELECT 1;');

      expect(() => loadMigrationFiles(tempDir)).toThrow('Malformed migration filename');
    });

    it('throws RelayError for duplicate migration versions', () => {
      writeFileSync(join(tempDir, '0001_first.sql'), 'SELECT 1;');
      writeFileSync(join(tempDir, '0001_another.sql'), 'SELECT 2;');

      expect(() => loadMigrationFiles(tempDir)).toThrow('Duplicate migration version');
    });
  });
});
