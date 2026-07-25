import { describe, expect, it } from 'vitest';

import { TaskArchivedError, TaskTransitionError } from '../../../../src/domain/task/task-errors.js';
import {
  activateTask,
  archiveTask,
  completeTask,
  moveTaskToBacklog,
  moveTaskToInbox,
  startTask,
} from '../../../../src/domain/task/task-lifecycle.js';
import {
  createTask,
  editTask,
  rehydrateTask,
  type Task,
} from '../../../../src/domain/task/task.js';
import type { TaskStatus } from '../../../../src/domain/task/task-status.js';

const CREATED_AT = '2026-07-25T10:00:00.000Z';
const UPDATED_AT = '2026-07-25T11:00:00.000Z';

function inboxTask(): Task {
  return createTask({ id: 'task-1', title: 'Lifecycle task', createdByType: 'HUMAN' }, CREATED_AT);
}

const TRANSITION_OPERATIONS: Readonly<Record<TaskStatus, (task: Task, now: string) => Task>> = {
  INBOX: moveTaskToInbox,
  ACTIVE: activateTask,
  IN_PROGRESS: startTask,
  BACKLOG: moveTaskToBacklog,
  DONE: completeTask,
  ARCHIVED: archiveTask,
};

const EXPECTED_TARGETS: Readonly<Record<TaskStatus, readonly TaskStatus[]>> = {
  INBOX: ['ACTIVE', 'BACKLOG', 'ARCHIVED'],
  ACTIVE: ['INBOX', 'IN_PROGRESS', 'BACKLOG', 'DONE', 'ARCHIVED'],
  IN_PROGRESS: ['ACTIVE', 'BACKLOG', 'DONE', 'ARCHIVED'],
  BACKLOG: ['INBOX', 'ACTIVE', 'ARCHIVED'],
  DONE: ['ARCHIVED'],
  ARCHIVED: [],
};

const ALL_STATUSES: readonly TaskStatus[] = [
  'INBOX',
  'ACTIVE',
  'IN_PROGRESS',
  'BACKLOG',
  'DONE',
  'ARCHIVED',
];

function taskIn(status: TaskStatus): Task {
  return rehydrateTask({
    ...inboxTask(),
    status,
    updatedAt: UPDATED_AT,
    startedAt: status === 'IN_PROGRESS' ? UPDATED_AT : null,
    completedAt: status === 'DONE' ? UPDATED_AT : null,
    archivedAt: status === 'ARCHIVED' ? UPDATED_AT : null,
  });
}

describe('task lifecycle operations', () => {
  it('moves an inbox task through active to in progress and records the first start time', () => {
    const active = activateTask(inboxTask(), UPDATED_AT);
    const inProgress = startTask(active, '2026-07-25T12:00:00.000Z');

    expect(inProgress).toMatchObject({
      status: 'IN_PROGRESS',
      startedAt: '2026-07-25T12:00:00.000Z',
      updatedAt: '2026-07-25T12:00:00.000Z',
    });
  });

  it('returns the original task for an idempotent transition', () => {
    const task = inboxTask();
    expect(moveTaskToInbox(task, UPDATED_AT)).toBe(task);
  });

  it('rejects invalid transitions and completes without inventing a start time', () => {
    expect(() => completeTask(inboxTask(), UPDATED_AT)).toThrow(TaskTransitionError);

    const completed = completeTask(
      activateTask(inboxTask(), UPDATED_AT),
      '2026-07-25T12:00:00.000Z',
    );
    expect(completed).toMatchObject({
      status: 'DONE',
      startedAt: null,
      completedAt: '2026-07-25T12:00:00.000Z',
    });
  });

  it('archives a completed task while preserving completion time', () => {
    const completed = completeTask(
      activateTask(inboxTask(), UPDATED_AT),
      '2026-07-25T12:00:00.000Z',
    );
    const archived = archiveTask(completed, '2026-07-25T13:00:00.000Z');

    expect(archived).toMatchObject({
      status: 'ARCHIVED',
      completedAt: '2026-07-25T12:00:00.000Z',
      archivedAt: '2026-07-25T13:00:00.000Z',
    });
  });

  it.each([
    ['INBOX', (task: Task) => task],
    ['ACTIVE', (task: Task) => activateTask(task, UPDATED_AT)],
    [
      'IN_PROGRESS',
      (task: Task) => startTask(activateTask(task, UPDATED_AT), '2026-07-25T12:00:00.000Z'),
    ],
    ['BACKLOG', (task: Task) => moveTaskToBacklog(task, UPDATED_AT)],
  ] as const)('rehydrates an incomplete task archived from %s', (_source, prepare) => {
    const archived = archiveTask(prepare(inboxTask()), '2026-07-25T13:00:00.000Z');

    expect(archived.completedAt).toBeNull();
    expect(rehydrateTask(archived)).toEqual(archived);
  });

  it('preserves the first start time when a task re-enters in progress', () => {
    const firstStart = startTask(activateTask(inboxTask(), UPDATED_AT), '2026-07-25T12:00:00.000Z');
    const restarted = startTask(
      activateTask(firstStart, '2026-07-25T13:00:00.000Z'),
      '2026-07-25T14:00:00.000Z',
    );

    expect(restarted.startedAt).toBe('2026-07-25T12:00:00.000Z');
  });

  it('rejects reopening completed tasks, restoring archived tasks, and archived edits', () => {
    const done = completeTask(activateTask(inboxTask(), UPDATED_AT), '2026-07-25T12:00:00.000Z');
    const archived = archiveTask(done, '2026-07-25T13:00:00.000Z');

    expect(() => activateTask(done, '2026-07-25T13:00:00.000Z')).toThrow(TaskTransitionError);
    expect(() => moveTaskToInbox(archived, '2026-07-25T14:00:00.000Z')).toThrow(TaskArchivedError);
    expect(() => editTask(archived, { title: 'Nope' }, '2026-07-25T14:00:00.000Z')).toThrow(
      TaskArchivedError,
    );
  });

  it('allows each named operation only for its designated target', () => {
    const active = activateTask(inboxTask(), UPDATED_AT);
    expect(moveTaskToBacklog(active, '2026-07-25T12:00:00.000Z').status).toBe('BACKLOG');
  });

  it.each(
    ALL_STATUSES.flatMap((source) => ALL_STATUSES.map((target) => [source, target] as const)),
  )('applies the %s to %s transition contract', (source, target) => {
    const task = taskIn(source);
    const operation = TRANSITION_OPERATIONS[target];
    const now = '2026-07-25T12:00:00.000Z';
    const isNoOp = source === target;
    const isAllowed = EXPECTED_TARGETS[source].includes(target);

    if (isNoOp) {
      expect(operation(task, now)).toBe(task);
      return;
    }

    if (!isAllowed) {
      const expectedError = source === 'ARCHIVED' ? TaskArchivedError : TaskTransitionError;
      expect(() => operation(task, now)).toThrow(expectedError);
      return;
    }

    const transitioned = operation(task, now);
    expect(transitioned).toMatchObject({ status: target, updatedAt: now });
    expect(transitioned).not.toBe(task);
    expect(task.updatedAt).toBe(UPDATED_AT);
    if (target === 'IN_PROGRESS') expect(transitioned.startedAt).toBe(now);
    if (target === 'DONE') expect(transitioned.completedAt).toBe(now);
    if (target === 'ARCHIVED') expect(transitioned.archivedAt).toBe(now);
  });
});
