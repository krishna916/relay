import { describe, expect, it, vi, beforeEach } from 'vitest';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

const mockPragma = vi.fn();
const mockClose = vi.fn();
const mockDatabase = vi.fn(function MockDatabase() {
  return {
    pragma: mockPragma,
    close: mockClose,
    readonly: false,
  };
});

vi.mock('better-sqlite3', () => ({
  default: mockDatabase,
}));

describe('createDatabaseConnection', () => {
  beforeEach(() => {
    vi.resetModules();
    mockDatabase.mockClear();
    mockPragma.mockReset();
    mockClose.mockReset();
  });

  it('closes writable file-backed databases when WAL mode cannot be enabled', async () => {
    mockPragma
      .mockReturnValueOnce(undefined)
      .mockReturnValueOnce('delete')
      .mockReturnValueOnce(undefined);

    const { createDatabaseConnection } = await import('../../../src/database/connection.js');

    expect(() =>
      createDatabaseConnection({ path: join(tmpdir(), 'relay-connection-test.db') }),
    ).toThrow(/journal mode/i);
    expect(mockClose).toHaveBeenCalledTimes(1);
  });

  it('rejects relative injected database paths', async () => {
    const { createDatabaseConnection } = await import('../../../src/database/connection.js');

    expect(() => createDatabaseConnection({ path: 'tmp/test.db' })).toThrow(/absolute/i);
    expect(mockDatabase).not.toHaveBeenCalled();
  });
});
