import { afterEach, describe, expect, it } from 'vitest';
import type { Task } from '../../src/domain/task/task.js';
import { TaskValidationError } from '../../src/domain/task/task-errors.js';
import {
  taskRowToDomain,
  taskToParameters,
  type TaskRow,
} from '../../src/database/tasks/task-row.js';
import {
  TaskRepositoryConflictError,
  TaskRepositoryCorruptionError,
  TaskRepositoryError,
  TaskRepositoryNotFoundError,
} from '../../src/application/tasks/task-repository-errors.js';
import { SqliteTaskRepository } from '../../src/database/tasks/sqlite-task-repository.js';
import {
  createMigratedTemporaryDatabase,
  type TemporaryDatabaseContext,
} from '../support/temporary-database.js';

const FULL_TASK: Task = {
  id: 'task-full',
  title: 'Persist every field',
  description: 'A fully populated task',
  status: 'ARCHIVED',
  priority: 'HIGH',
  workspace: 'D:\\projects\\relay',
  sourceContext: 'issue:6',
  createdByType: 'AGENT',
  createdByName: 'Codex',
  createdAt: '2026-07-25T09:00:00.000Z',
  updatedAt: '2026-07-25T12:00:00.000Z',
  startedAt: '2026-07-25T10:00:00.000Z',
  completedAt: '2026-07-25T11:00:00.000Z',
  archivedAt: '2026-07-25T12:00:00.000Z',
};

const FULL_ROW: TaskRow = {
  id: 'task-full',
  title: 'Persist every field',
  description: 'A fully populated task',
  status: 'ARCHIVED',
  priority: 'HIGH',
  workspace: 'D:\\projects\\relay',
  source_context: 'issue:6',
  created_by_type: 'AGENT',
  created_by_name: 'Codex',
  created_at: '2026-07-25T09:00:00.000Z',
  updated_at: '2026-07-25T12:00:00.000Z',
  started_at: '2026-07-25T10:00:00.000Z',
  completed_at: '2026-07-25T11:00:00.000Z',
  archived_at: '2026-07-25T12:00:00.000Z',
};

function taskFixture(overrides: Partial<Task> = {}): Task {
  return {
    id: 'task-fixture',
    title: 'Fixture task',
    description: null,
    status: 'INBOX',
    priority: null,
    workspace: null,
    sourceContext: null,
    createdByType: 'HUMAN',
    createdByName: null,
    createdAt: '2026-07-25T09:00:00.000Z',
    updatedAt: '2026-07-25T09:00:00.000Z',
    startedAt: null,
    completedAt: null,
    archivedAt: null,
    ...overrides,
  };
}

describe('task row mapping', () => {
  it('maps every persisted column to the domain task', () => {
    expect(taskRowToDomain(FULL_ROW)).toEqual(FULL_TASK);
  });

  it('maps every domain field to a named SQL parameter', () => {
    expect(taskToParameters(FULL_TASK)).toEqual(FULL_ROW);
  });

  it('wraps invalid persisted data as repository corruption', () => {
    const corruptRow = { ...FULL_ROW, status: 'UNKNOWN' } as unknown as TaskRow;

    expect(() => taskRowToDomain(corruptRow)).toThrow(TaskRepositoryCorruptionError);

    try {
      taskRowToDomain(corruptRow);
    } catch (error) {
      expect(error).toBeInstanceOf(TaskRepositoryCorruptionError);
      expect((error as TaskRepositoryCorruptionError).code).toBe('TASK_DATA_CORRUPT');
      expect((error as TaskRepositoryCorruptionError).cause).toBeInstanceOf(Error);
    }
  });
});

describe('SQLite task repository create and find', () => {
  let context: TemporaryDatabaseContext | null = null;

  afterEach(() => {
    context?.cleanup();
    context = null;
  });

  function createRepository(): SqliteTaskRepository {
    context = createMigratedTemporaryDatabase();
    return new SqliteTaskRepository(context.db);
  }

  it('round-trips a task with every optional field populated', () => {
    const repository = createRepository();

    expect(repository.create(FULL_TASK)).toEqual(FULL_TASK);
    expect(repository.findById(FULL_TASK.id)).toEqual(FULL_TASK);
    expect(context?.db.open).toBe(true);
  });

  it('round-trips null for every optional field', () => {
    const repository = createRepository();
    const minimalTask: Task = {
      id: 'task-minimal',
      title: 'Minimal task',
      description: null,
      status: 'INBOX',
      priority: null,
      workspace: null,
      sourceContext: null,
      createdByType: 'HUMAN',
      createdByName: null,
      createdAt: '2026-07-25T09:00:00.000Z',
      updatedAt: '2026-07-25T09:00:00.000Z',
      startedAt: null,
      completedAt: null,
      archivedAt: null,
    };

    repository.create(minimalTask);

    expect(repository.findById(minimalTask.id)).toEqual(minimalTask);
  });

  it.each([
    ['INBOX', null, null, null],
    ['ACTIVE', null, null, null],
    ['IN_PROGRESS', '2026-07-25T09:30:00.000Z', null, null],
    ['BACKLOG', null, null, null],
    ['DONE', null, '2026-07-25T10:30:00.000Z', null],
    ['ARCHIVED', null, null, '2026-07-25T11:30:00.000Z'],
  ] as const)('round-trips the %s status', (status, startedAt, completedAt, archivedAt) => {
    const repository = createRepository();
    const task: Task = {
      ...FULL_TASK,
      id: `task-${status.toLowerCase()}`,
      status,
      startedAt,
      completedAt,
      archivedAt,
    };

    repository.create(task);

    expect(repository.findById(task.id)).toEqual(task);
  });

  it.each(['LOW', 'NORMAL', 'HIGH'] as const)('round-trips %s priority', (priority) => {
    const repository = createRepository();
    const task: Task = {
      ...FULL_TASK,
      id: `task-${priority.toLowerCase()}`,
      priority,
    };

    repository.create(task);

    expect(repository.findById(task.id)).toEqual(task);
  });

  it('returns null when the task does not exist', () => {
    const repository = createRepository();

    expect(repository.findById('missing')).toBeNull();
  });

  it('throws a typed conflict for a duplicate task ID', () => {
    const repository = createRepository();
    repository.create(FULL_TASK);

    expect(() => repository.create(FULL_TASK)).toThrow(TaskRepositoryConflictError);
  });
});

describe('SQLite task repository update', () => {
  let context: TemporaryDatabaseContext | null = null;

  afterEach(() => {
    context?.cleanup();
    context = null;
  });

  function createRepository(): SqliteTaskRepository {
    context = createMigratedTemporaryDatabase();
    return new SqliteTaskRepository(context.db);
  }

  it('updates every mutable persisted field without assigning creation data', () => {
    const repository = createRepository();
    const original = taskFixture({
      id: 'task-update',
      status: 'ACTIVE',
      priority: 'LOW',
      createdByType: 'AGENT',
      createdByName: 'Original agent',
    });
    repository.create(original);

    const updated: Task = {
      ...original,
      title: 'Updated title',
      description: 'Updated description',
      status: 'DONE',
      priority: 'HIGH',
      workspace: 'D:\\updated',
      sourceContext: 'issue:6#update',
      updatedAt: '2026-07-25T11:00:00.000Z',
      startedAt: '2026-07-25T10:00:00.000Z',
      completedAt: '2026-07-25T11:00:00.000Z',
      archivedAt: null,
    };

    expect(repository.update(updated)).toEqual(updated);
    expect(repository.findById(updated.id)).toEqual(updated);

    const creationData = context?.db
      .prepare('SELECT id, created_by_type, created_by_name, created_at FROM tasks WHERE id = ?')
      .get(updated.id);
    expect(creationData).toEqual({
      id: original.id,
      created_by_type: original.createdByType,
      created_by_name: original.createdByName,
      created_at: original.createdAt,
    });
  });

  it('throws a typed not-found error when the update target is missing', () => {
    const repository = createRepository();

    expect(() => repository.update(taskFixture({ id: 'missing' }))).toThrow(
      TaskRepositoryNotFoundError,
    );
  });
});

describe('SQLite task repository list', () => {
  let context: TemporaryDatabaseContext | null = null;

  afterEach(() => {
    context?.cleanup();
    context = null;
  });

  function createRepository(): SqliteTaskRepository {
    context = createMigratedTemporaryDatabase();
    return new SqliteTaskRepository(context.db);
  }

  it('filters by one status and returns an empty array when nothing matches', () => {
    const repository = createRepository();
    const inbox = taskFixture({ id: 'inbox' });
    const active = taskFixture({ id: 'active', status: 'ACTIVE' });
    repository.create(inbox);
    repository.create(active);

    expect(repository.list({ statuses: ['ACTIVE'], limit: 200 })).toEqual([active]);
    expect(repository.list({ statuses: ['BACKLOG'], limit: 200 })).toEqual([]);
  });

  it('filters by multiple statuses', () => {
    const repository = createRepository();
    const inbox = taskFixture({ id: 'inbox' });
    const active = taskFixture({ id: 'active', status: 'ACTIVE' });
    const backlog = taskFixture({ id: 'backlog', status: 'BACKLOG' });
    repository.create(inbox);
    repository.create(active);
    repository.create(backlog);

    expect(repository.list({ statuses: ['INBOX', 'BACKLOG'], limit: 200 })).toEqual([
      backlog,
      inbox,
    ]);
  });

  it('orders by updated time, creation time, and ascending ID', () => {
    const repository = createRepository();
    const older = taskFixture({
      id: 'older',
      updatedAt: '2026-07-25T10:00:00.000Z',
    });
    const tieB = taskFixture({
      id: 'tie-b',
      createdAt: '2026-07-25T10:00:00.000Z',
      updatedAt: '2026-07-25T11:00:00.000Z',
    });
    const newest = taskFixture({
      id: 'newest',
      createdAt: '2026-07-25T09:30:00.000Z',
      updatedAt: '2026-07-25T12:00:00.000Z',
    });
    const tieA = taskFixture({
      id: 'tie-a',
      createdAt: '2026-07-25T10:00:00.000Z',
      updatedAt: '2026-07-25T11:00:00.000Z',
    });
    for (const task of [older, tieB, newest, tieA]) {
      repository.create(task);
    }

    expect(repository.list({ statuses: ['INBOX'], limit: 200 })).toEqual([
      newest,
      tieA,
      tieB,
      older,
    ]);
  });

  it('accepts both limit boundaries and applies the requested limit', () => {
    const repository = createRepository();
    const older = taskFixture({ id: 'older' });
    const newer = taskFixture({
      id: 'newer',
      updatedAt: '2026-07-25T10:00:00.000Z',
    });
    repository.create(older);
    repository.create(newer);

    expect(repository.list({ statuses: ['INBOX'], limit: 1 })).toEqual([newer]);
    expect(repository.list({ statuses: ['INBOX'], limit: 200 })).toEqual([newer, older]);
  });

  it.each([
    [{ statuses: [], limit: 1 }, 'empty statuses'],
    [{ statuses: ['INBOX'] as const, limit: 0 }, 'zero limit'],
    [{ statuses: ['INBOX'] as const, limit: 201 }, 'limit above 200'],
    [{ statuses: ['INBOX'] as const, limit: 1.5 }, 'fractional limit'],
    [{ statuses: ['INBOX'] as const, limit: Number.NaN }, 'nonfinite limit'],
  ])('rejects an invalid list query: %s', (query, _scenario) => {
    const repository = createRepository();

    expect(() => repository.list(query)).toThrow(TaskRepositoryError);
  });
});

describe('SQLite task repository failure translation', () => {
  let context: TemporaryDatabaseContext | null = null;

  afterEach(() => {
    context?.cleanup();
    context = null;
  });

  function createRepository(): SqliteTaskRepository {
    context = createMigratedTemporaryDatabase();
    return new SqliteTaskRepository(context.db);
  }

  it('translates a task CHECK failure into a typed conflict', () => {
    const repository = createRepository();

    expect(() => repository.create(taskFixture({ title: '   ' }))).toThrow(
      TaskRepositoryConflictError,
    );
  });

  it('translates an update CHECK failure into a typed conflict', () => {
    const repository = createRepository();
    const task = taskFixture({ id: 'update-conflict' });
    repository.create(task);

    expect(() => repository.update({ ...task, title: '   ' })).toThrow(TaskRepositoryConflictError);
  });

  it('translates invalid stored data into corruption with the domain error as cause', () => {
    const repository = createRepository();
    context?.db.pragma('ignore_check_constraints = ON');
    context?.db
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
      .run({ ...FULL_ROW, id: 'corrupt', status: 'UNKNOWN' });
    context?.db.pragma('ignore_check_constraints = OFF');

    expect(() => repository.findById('corrupt')).toThrow(TaskRepositoryCorruptionError);

    try {
      repository.findById('corrupt');
    } catch (error) {
      expect(error).toBeInstanceOf(TaskRepositoryCorruptionError);
      expect((error as TaskRepositoryCorruptionError).cause).toBeInstanceOf(TaskValidationError);
    }
  });

  it.each([
    ['create', (repository: SqliteTaskRepository) => repository.create(FULL_TASK)],
    ['find', (repository: SqliteTaskRepository) => repository.findById(FULL_TASK.id)],
    ['update', (repository: SqliteTaskRepository) => repository.update(FULL_TASK)],
    [
      'list',
      (repository: SqliteTaskRepository) => repository.list({ statuses: ['INBOX'], limit: 1 }),
    ],
  ] as const)('wraps a closed-connection failure during %s', (_operation, invoke) => {
    const repository = createRepository();
    const dbPath = context?.dbPath ?? '';
    context?.db.close();

    let caught: unknown;
    try {
      invoke(repository);
    } catch (error) {
      caught = error;
    }

    expect(caught).toBeInstanceOf(TaskRepositoryError);
    expect((caught as TaskRepositoryError).cause).toBeInstanceOf(Error);
    expect((caught as TaskRepositoryError).message).not.toContain(dbPath);
    expect((caught as TaskRepositoryError).message).not.toMatch(
      /\b(?:SELECT|INSERT|UPDATE|DELETE)\b/i,
    );
  });
});
