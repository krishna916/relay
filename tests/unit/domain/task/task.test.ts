import { describe, expect, it } from 'vitest';

import { TaskValidationError } from '../../../../src/domain/task/task-errors.js';
import { TASK_PRIORITIES } from '../../../../src/domain/task/task-priority.js';
import { TASK_STATUSES } from '../../../../src/domain/task/task-status.js';
import { createTask, editTask, rehydrateTask } from '../../../../src/domain/task/task.js';

const CREATED_AT = '2026-07-25T10:00:00.000Z';

describe('createTask', () => {
  it('requires a valid session ID for agents and forbids it for humans', () => {
    expect(
      createTask(
        {
          id: 'agent-task',
          title: 'Captured task',
          createdByType: 'AGENT',
          createdByName: 'Codex',
          sessionId: ' session:2026.07-26 ',
        },
        CREATED_AT,
      ),
    ).toMatchObject({ sessionId: 'session:2026.07-26' });

    expect(() =>
      createTask(
        {
          id: 'agent-missing',
          title: 'Missing session',
          createdByType: 'AGENT',
          createdByName: 'Codex',
        },
        CREATED_AT,
      ),
    ).toThrow(TaskValidationError);
    expect(() =>
      createTask(
        { id: 'human-session', title: 'Human session', createdByType: 'HUMAN', sessionId: 's-1' },
        CREATED_AT,
      ),
    ).toThrow(TaskValidationError);
  });

  it.each(['', 'x'.repeat(129), 'spaces are invalid', 'slash/is-invalid'])(
    'rejects an invalid agent session ID: %s',
    (sessionId) => {
      expect(() =>
        createTask(
          {
            id: 'agent-task',
            title: 'Captured task',
            createdByType: 'AGENT',
            createdByName: 'Codex',
            sessionId,
          },
          CREATED_AT,
        ),
      ).toThrow(TaskValidationError);
    },
  );

  it.each(['a', 's'.repeat(128)])('accepts session ID boundary: %s', (sessionId) => {
    expect(
      createTask(
        {
          id: 'agent-task',
          title: 'Captured task',
          createdByType: 'AGENT',
          createdByName: 'Codex',
          sessionId,
        },
        CREATED_AT,
      ).sessionId,
    ).toBe(sessionId);
  });

  it('creates a normalized inbox task with the supplied creation time', () => {
    const task = createTask(
      {
        id: ' task-1 ',
        title: ' Draft implementation plan ',
        createdByType: 'HUMAN',
      },
      CREATED_AT,
    );

    expect(task).toEqual({
      id: 'task-1',
      title: 'Draft implementation plan',
      description: null,
      status: 'INBOX',
      priority: null,
      workspace: null,
      sourceContext: null,
      createdByType: 'HUMAN',
      createdByName: null,
      sessionId: null,
      createdAt: CREATED_AT,
      updatedAt: CREATED_AT,
      startedAt: null,
      completedAt: null,
      archivedAt: null,
    });
  });

  it('rejects blank titles with a field-specific domain error', () => {
    expect(() =>
      createTask({ id: 'task-1', title: '   ', createdByType: 'HUMAN' }, CREATED_AT),
    ).toThrow(TaskValidationError);

    try {
      createTask({ id: 'task-1', title: '   ', createdByType: 'HUMAN' }, CREATED_AT);
    } catch (error) {
      expect(error).toMatchObject({ code: 'TASK_VALIDATION', field: 'title' });
    }
  });

  it.each([
    ['id', '', 'id'],
    ['id', 'x'.repeat(101), 'id'],
    ['title', '', 'title'],
    ['title', 'x'.repeat(301), 'title'],
    ['description', 'x'.repeat(10_001), 'description'],
    ['workspace', 'x'.repeat(256), 'workspace'],
    ['sourceContext', 'x'.repeat(1_001), 'sourceContext'],
    ['createdByName', 'x'.repeat(101), 'createdByName'],
  ] as const)('rejects %s outside its contract limit', (_name, value, field) => {
    expect(() =>
      createTask(
        {
          id: field === 'id' ? value : 'task-1',
          title: field === 'title' ? value : 'Task',
          createdByType: 'HUMAN',
          ...(field === 'description' ? { description: value } : {}),
          ...(field === 'workspace' ? { workspace: value } : {}),
          ...(field === 'sourceContext' ? { sourceContext: value } : {}),
          ...(field === 'createdByName' ? { createdByName: value } : {}),
        },
        CREATED_AT,
      ),
    ).toThrow(TaskValidationError);
  });

  it.each([
    ['id', 'i'.repeat(100), { id: 'i'.repeat(100) }],
    ['title', 't'.repeat(300), { title: 't'.repeat(300) }],
    ['description', 'd'.repeat(10_000), { description: 'd'.repeat(10_000) }],
    ['workspace', 'w'.repeat(255), { workspace: 'w'.repeat(255) }],
    ['sourceContext', 's'.repeat(1_000), { sourceContext: 's'.repeat(1_000) }],
    [
      'createdByName',
      'a'.repeat(100),
      { createdByType: 'AGENT' as const, createdByName: 'a'.repeat(100) },
    ],
  ] as const)('accepts %s at its exact maximum length', (field, value, changes) => {
    const task = createTask(
      {
        id: 'task-1',
        title: 'Task',
        createdByType: 'HUMAN',
        ...changes,
        ...('createdByType' in changes && changes.createdByType === 'AGENT'
          ? { sessionId: 'session-1' }
          : {}),
      },
      CREATED_AT,
    );

    expect(task).toMatchObject({ [field]: value });
  });

  it('rejects invalid creator and priority values', () => {
    expect(() =>
      createTask({ id: 'task-1', title: 'Task', createdByType: 'AGENT' }, CREATED_AT),
    ).toThrow(TaskValidationError);
    expect(() =>
      createTask({ id: 'task-1', title: 'Task', createdByType: 'ROBOT' as never }, CREATED_AT),
    ).toThrow(TaskValidationError);
    expect(() =>
      createTask(
        { id: 'task-1', title: 'Task', createdByType: 'HUMAN', priority: 'URGENT' as never },
        CREATED_AT,
      ),
    ).toThrow(TaskValidationError);
  });

  it('exposes the shared status and priority values through task behavior', () => {
    expect(TASK_STATUSES).toEqual([
      'INBOX',
      'ACTIVE',
      'IN_PROGRESS',
      'BACKLOG',
      'DONE',
      'ARCHIVED',
    ]);
    expect(TASK_PRIORITIES).toEqual(['LOW', 'NORMAL', 'HIGH']);
  });
});

describe('rehydrateTask', () => {
  it('preserves a complete valid persisted task without rewriting timestamps', () => {
    const persisted = {
      id: 'task-1',
      title: 'Persisted task',
      description: 'Preserve this description',
      status: 'DONE' as const,
      priority: 'HIGH' as const,
      workspace: 'relay',
      sourceContext: 'issue-5',
      createdByType: 'AGENT' as const,
      createdByName: 'Codex',
      sessionId: 'session-1',
      createdAt: '2026-07-25T10:00:00.000Z',
      updatedAt: '2026-07-25T11:00:00.000Z',
      startedAt: '2026-07-25T10:10:00.000Z',
      completedAt: '2026-07-25T11:00:00.000Z',
      archivedAt: null,
    };

    expect(rehydrateTask(persisted)).toEqual(persisted);
  });

  it('rejects persisted status and timestamp combinations that conflict', () => {
    expect(() =>
      rehydrateTask({
        id: 'task-1',
        title: 'Incomplete completed task',
        description: null,
        status: 'DONE',
        priority: null,
        workspace: null,
        sourceContext: null,
        createdByType: 'HUMAN',
        createdByName: null,
        sessionId: null,
        createdAt: CREATED_AT,
        updatedAt: CREATED_AT,
        startedAt: null,
        completedAt: null,
        archivedAt: null,
      }),
    ).toThrow(TaskValidationError);
  });
});

describe('editTask', () => {
  it('updates normalized metadata without mutating the original task', () => {
    const original = createTask(
      { id: 'task-1', title: 'Original', createdByType: 'HUMAN' },
      CREATED_AT,
    );
    const edited = editTask(
      original,
      { title: ' Revised ', description: ' notes ' },
      '2026-07-25T11:00:00.000Z',
    );

    expect(edited).toMatchObject({
      title: 'Revised',
      description: 'notes',
      updatedAt: '2026-07-25T11:00:00.000Z',
    });
    expect(edited).not.toBe(original);
    expect(original.title).toBe('Original');
  });

  it('returns the original task for a normalized no-op edit', () => {
    const task = createTask(
      { id: 'task-1', title: 'Original', createdByType: 'HUMAN' },
      CREATED_AT,
    );
    expect(editTask(task, { title: ' Original ' }, '2026-07-25T11:00:00.000Z')).toBe(task);
  });
});
