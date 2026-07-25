import { describe, it, expect, afterEach } from 'vitest';
import {
  resolveDatabasePath,
  getDefaultDatabasePath,
} from '../../../src/database/database-config.js';

describe('resolveDatabasePath', () => {
  const origEnv = process.env.RELAY_DB_PATH;

  afterEach(() => {
    if (origEnv !== undefined) {
      process.env.RELAY_DB_PATH = origEnv;
    } else {
      delete process.env.RELAY_DB_PATH;
    }
  });

  it('prefers explicit argument over environment variable', () => {
    process.env.RELAY_DB_PATH = '/env/path.db';
    const path = resolveDatabasePath('/explicit/path.db');
    expect(path).toBe('/explicit/path.db');
  });

  it('uses RELAY_DB_PATH env var when no explicit path passed', () => {
    process.env.RELAY_DB_PATH = '/env/path.db';
    const path = resolveDatabasePath();
    expect(path).toBe('/env/path.db');
  });

  it('rejects empty or whitespace-only explicit path', () => {
    expect(() => resolveDatabasePath('')).toThrow();
    expect(() => resolveDatabasePath('   ')).toThrow();
  });

  it('returns default database path when neither explicit path nor env var is provided', () => {
    delete process.env.RELAY_DB_PATH;
    const path = resolveDatabasePath();
    expect(path).toBe(getDefaultDatabasePath());
  });
});
