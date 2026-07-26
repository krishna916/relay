import { describe, it, expect, afterEach } from 'vitest';
import { copyFileSync, mkdirSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { createTemporaryDatabase } from '../support/temporary-database.js';
import { runMigrations } from '../../src/database/migrate.js';
import { RelayError } from '../../src/shared/errors.js';
import { normalizeTaskTitleV1 } from '../../src/database/migrations/functions/normalize-task-title-v1.js';

describe('database-migrations integration', () => {
  let tempDb: ReturnType<typeof createTemporaryDatabase> | null = null;

  afterEach(() => {
    tempDb?.cleanup();
    tempDb = null;
  });

  it('uses the frozen v1 title-normalization contract for migration 0004', () => {
    expect(normalizeTaskTitleV1('  Existing\t task!!!  ')).toBe('existing task');
    expect(
      readFileSync('src/database/migrations/0004_task_normalized_title.sql', 'utf8'),
    ).toContain('relay_normalize_task_title_v1(title)');
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
    expect(migrations).toEqual([
      { version: 1, name: 'scaffold' },
      { version: 2, name: 'tasks' },
      { version: 3, name: 'task_session_id' },
      { version: 4, name: 'task_normalized_title' },
    ]);

    // Verify relay_metadata table scaffolded by 0001_scaffold.sql
    const meta = db
      .prepare('SELECT key, value FROM relay_metadata WHERE key = ?')
      .get('schema_version') as {
      key: string;
      value: string;
    };
    expect(meta).toEqual({ key: 'schema_version', value: '1' });

    const taskColumns = db.prepare('PRAGMA table_info(tasks)').all() as {
      name: string;
      type: string;
      notnull: number;
      pk: number;
    }[];
    expect(taskColumns).toEqual([
      expect.objectContaining({ name: 'id', type: 'TEXT', notnull: 0, pk: 1 }),
      expect.objectContaining({ name: 'title', type: 'TEXT', notnull: 1, pk: 0 }),
      expect.objectContaining({ name: 'description', type: 'TEXT', notnull: 0, pk: 0 }),
      expect.objectContaining({ name: 'status', type: 'TEXT', notnull: 1, pk: 0 }),
      expect.objectContaining({ name: 'priority', type: 'TEXT', notnull: 0, pk: 0 }),
      expect.objectContaining({ name: 'workspace', type: 'TEXT', notnull: 0, pk: 0 }),
      expect.objectContaining({ name: 'source_context', type: 'TEXT', notnull: 0, pk: 0 }),
      expect.objectContaining({ name: 'created_by_type', type: 'TEXT', notnull: 1, pk: 0 }),
      expect.objectContaining({ name: 'created_by_name', type: 'TEXT', notnull: 0, pk: 0 }),
      expect.objectContaining({ name: 'created_at', type: 'TEXT', notnull: 1, pk: 0 }),
      expect.objectContaining({ name: 'updated_at', type: 'TEXT', notnull: 1, pk: 0 }),
      expect.objectContaining({ name: 'started_at', type: 'TEXT', notnull: 0, pk: 0 }),
      expect.objectContaining({ name: 'completed_at', type: 'TEXT', notnull: 0, pk: 0 }),
      expect.objectContaining({ name: 'archived_at', type: 'TEXT', notnull: 0, pk: 0 }),
      expect.objectContaining({ name: 'session_id', type: 'TEXT', notnull: 0, pk: 0 }),
      expect.objectContaining({ name: 'normalized_title', type: 'TEXT', notnull: 1, pk: 0 }),
    ]);

    const indexes = db.prepare('PRAGMA index_list(tasks)').all() as { name: string }[];
    expect(indexes).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ name: 'idx_tasks_status_updated_at' }),
        expect.objectContaining({ name: 'idx_tasks_normalized_title_active_workspace' }),
      ]),
    );

    // Idempotence test
    expect(() => runMigrations(db)).not.toThrow();
    expect(
      db.prepare('SELECT version, name FROM _relay_migrations ORDER BY version').all(),
    ).toHaveLength(4);
  });

  it('upgrades a v2 database without changing its existing task data', () => {
    tempDb = createTemporaryDatabase();
    const { db, dir } = tempDb;
    const v2Migrations = join(dir, 'v2-migrations');
    mkdirSync(v2Migrations, { recursive: true });
    copyFileSync(
      'src/database/migrations/0001_scaffold.sql',
      join(v2Migrations, '0001_scaffold.sql'),
    );
    copyFileSync('src/database/migrations/0002_tasks.sql', join(v2Migrations, '0002_tasks.sql'));
    runMigrations(db, { migrationsDir: v2Migrations });
    db.prepare(
      `INSERT INTO tasks (
        id, title, description, status, priority, workspace, source_context,
        created_by_type, created_by_name, created_at, updated_at, started_at,
        completed_at, archived_at
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
    ).run(
      'v2-task',
      '  Existing\t task!!!  ',
      null,
      'INBOX',
      null,
      null,
      null,
      'HUMAN',
      null,
      '2026-07-25T09:00:00.000Z',
      '2026-07-25T09:00:00.000Z',
      null,
      null,
      null,
    );
    db.prepare(
      `INSERT INTO tasks (
        id, title, description, status, priority, workspace, source_context,
        created_by_type, created_by_name, created_at, updated_at, started_at,
        completed_at, archived_at
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
    ).run(
      'v2-ascii',
      'Existing task',
      null,
      'INBOX',
      null,
      null,
      null,
      'HUMAN',
      null,
      '2026-07-25T09:01:00.000Z',
      '2026-07-25T09:01:00.000Z',
      null,
      null,
      null,
    );
    db.prepare(
      `INSERT INTO tasks (
        id, title, description, status, priority, workspace, source_context,
        created_by_type, created_by_name, created_at, updated_at, started_at,
        completed_at, archived_at
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
    ).run(
      'v2-unicode',
      'ÄBC',
      null,
      'INBOX',
      null,
      null,
      null,
      'HUMAN',
      null,
      '2026-07-25T09:02:00.000Z',
      '2026-07-25T09:02:00.000Z',
      null,
      null,
      null,
    );

    runMigrations(db);

    expect(
      db.prepare('SELECT id, title, session_id, normalized_title FROM tasks ORDER BY id').all(),
    ).toEqual([
      {
        id: 'v2-ascii',
        title: 'Existing task',
        session_id: null,
        normalized_title: 'existing task',
      },
      {
        id: 'v2-task',
        title: '  Existing\t task!!!  ',
        session_id: null,
        normalized_title: 'existing task',
      },
      {
        id: 'v2-unicode',
        title: 'ÄBC',
        session_id: null,
        normalized_title: 'äbc',
      },
    ]);
    expect(db.prepare('SELECT version FROM _relay_migrations ORDER BY version').all()).toEqual([
      { version: 1 },
      { version: 2 },
      { version: 3 },
      { version: 4 },
    ]);
  });

  it.each([
    ['blank title', { title: '   ' }],
    ['title longer than 300 characters', { title: 't'.repeat(301) }],
    ['description longer than 10,000 characters', { description: 'd'.repeat(10_001) }],
    ['workspace longer than 255 characters', { workspace: 'w'.repeat(256) }],
    ['source context longer than 1,000 characters', { source_context: 's'.repeat(1_001) }],
    ['creator name longer than 100 characters', { created_by_name: 'c'.repeat(101) }],
    ['unsupported status', { status: 'UNKNOWN' }],
    ['unsupported priority', { priority: 'URGENT' }],
    ['unsupported creator type', { created_by_type: 'SYSTEM' }],
    ['agent without a name', { created_by_type: 'AGENT', created_by_name: null }],
    ['done without completion time', { status: 'DONE', completed_at: null }],
    [
      'completion time on an active task',
      { status: 'ACTIVE', completed_at: '2026-07-25T10:00:00.000Z' },
    ],
    ['archived without archive time', { status: 'ARCHIVED', archived_at: null }],
    ['archive time on an inbox task', { status: 'INBOX', archived_at: '2026-07-25T10:00:00.000Z' }],
  ])('rejects a task with %s', (_scenario, changes) => {
    tempDb = createTemporaryDatabase();
    const { db } = tempDb;
    runMigrations(db);

    const task = {
      id: 'task-1',
      title: 'Valid title',
      description: null,
      status: 'INBOX',
      priority: null,
      workspace: null,
      source_context: null,
      created_by_type: 'HUMAN',
      created_by_name: null,
      created_at: '2026-07-25T09:00:00.000Z',
      updated_at: '2026-07-25T09:00:00.000Z',
      started_at: null,
      completed_at: null,
      archived_at: null,
      ...changes,
    };

    expect(() =>
      db
        .prepare(
          `INSERT INTO tasks (
            id, title, description, status, priority, workspace, source_context,
            created_by_type, created_by_name, created_at, updated_at, started_at,
            completed_at, archived_at
          ) VALUES (
            @id, @title, @description, @status, @priority, @workspace, @source_context,
            @created_by_type, @created_by_name, @created_at, @updated_at, @started_at,
            @completed_at, @archived_at
          )`,
        )
        .run(task),
    ).toThrow();
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

  it('rejects startup when an already-applied migration file is missing', () => {
    tempDb = createTemporaryDatabase();
    const { db, dir } = tempDb;

    const migrationsDir = join(dir, 'migrations');
    mkdirSync(migrationsDir, { recursive: true });

    const sqlPath = join(migrationsDir, '0001_initial.sql');
    writeFileSync(sqlPath, 'CREATE TABLE test_table (id INT PRIMARY KEY);');

    runMigrations(db, { migrationsDir });
    rmSync(sqlPath);

    expect(() => runMigrations(db, { migrationsDir })).toThrow(RelayError);
    expect(() => runMigrations(db, { migrationsDir })).toThrow(/Migration mismatch/);
  });
});
