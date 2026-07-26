import { describe, expect, it } from 'vitest';
import {
  InvalidTaskRequestError,
  TaskApplicationError,
  TaskNotFoundError,
  TaskPersistenceError,
} from '../../../../src/application/tasks/task-application-errors.js';
import { createTaskApplication } from '../../../../src/application/tasks/task-application.js';
import {
  TaskRepositoryError,
  TaskRepositoryNotFoundError,
} from '../../../../src/application/tasks/task-repository-errors.js';
import {
  TaskArchivedError,
  TaskTransitionError,
  TaskValidationError,
} from '../../../../src/domain/task/task-errors.js';
import type { Task } from '../../../../src/domain/task/task.js';
import { FixedClock, FixedIdGenerator, InMemoryTaskRepository } from './task-test-fixtures.js';

describe('task application errors', () => {
  it('exposes stable, distinguishable application error codes', () => {
    expect(new TaskApplicationError('base').code).toBe('TASK_APPLICATION_ERROR');
    expect(new TaskNotFoundError('missing').code).toBe('TASK_NOT_FOUND');
    expect(new InvalidTaskRequestError('invalid').code).toBe('INVALID_TASK_REQUEST');
    expect(new TaskPersistenceError('persistence').code).toBe('TASK_PERSISTENCE_ERROR');
  });
});

const NOW = new Date('2026-07-25T12:00:00.000Z');

function setup() {
  const repository = new InMemoryTaskRepository();
  const clock = new FixedClock(NOW);
  const idGenerator = new FixedIdGenerator();
  return {
    application: createTaskApplication({ repository, clock, idGenerator }),
    repository,
    clock,
    idGenerator,
  };
}

function task(overrides: Partial<Task> = {}): Task {
  return {
    id: 'task-1',
    title: 'Task',
    description: null,
    status: 'INBOX',
    priority: null,
    workspace: null,
    sourceContext: null,
    createdByType: 'HUMAN',
    createdByName: null,
    sessionId: null,
    createdAt: '2026-07-25T10:00:00.000Z',
    updatedAt: '2026-07-25T10:00:00.000Z',
    startedAt: null,
    completedAt: null,
    archivedAt: null,
    ...overrides,
  };
}

describe('TaskApplication', () => {
  it('uses production clock and UUID defaults when only a repository is supplied', () => {
    const repository = new InMemoryTaskRepository();
    const application = createTaskApplication({ repository });

    const created = application.create({
      title: 'Default dependencies',
      creator: { type: 'HUMAN' },
    });

    expect(created.id).toMatch(/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i);
    expect(created.createdAt).toBe(created.updatedAt);
    expect(Number.isNaN(new Date(created.createdAt).getTime())).toBe(false);
  });

  it('creates a full agent task using one generated ID and one shared timestamp', () => {
    const { application, repository, clock, idGenerator } = setup();
    const result = application.create({
      title: '  Plan release  ',
      description: ' notes ',
      priority: 'HIGH',
      workspace: ' relay ',
      sourceContext: ' issue-7 ',
      sessionId: ' session-issue-7 ',
      creator: { type: 'AGENT', name: ' Codex ' },
    });
    expect(result).toMatchObject({
      id: 'generated-task-id',
      title: 'Plan release',
      description: 'notes',
      priority: 'HIGH',
      workspace: 'relay',
      sourceContext: 'issue-7',
      sessionId: 'session-issue-7',
      status: 'INBOX',
      createdByType: 'AGENT',
      createdByName: 'Codex',
      createdAt: NOW.toISOString(),
      updatedAt: NOW.toISOString(),
    });
    expect(repository.createCalls).toBe(1);
    expect(idGenerator.calls).toBe(1);
    expect(clock.calls).toBe(1);
  });

  it('creates a minimal human task with null optional metadata', () => {
    const { application } = setup();

    expect(application.create({ title: 'Human task', creator: { type: 'HUMAN' } })).toMatchObject({
      title: 'Human task',
      description: null,
      priority: null,
      workspace: null,
      sourceContext: null,
      createdByType: 'HUMAN',
      createdByName: null,
      status: 'INBOX',
    });
  });

  it('does not persist invalid creation input', () => {
    const { application, repository } = setup();
    expect(() => application.create({ title: ' ', creator: { type: 'HUMAN' } })).toThrow(
      TaskValidationError,
    );
    expect(repository.createCalls).toBe(0);
  });

  it('gets an existing task and maps a missing task to a stable error', () => {
    const { application, repository } = setup();
    repository.tasks.set('task-1', task());
    expect(application.get({ id: 'task-1' })).toEqual(task());
    expect(() => application.get({ id: 'missing' })).toThrow(TaskNotFoundError);
  });

  it('normalizes bounded list filters without reordering returned tasks', () => {
    const { application, repository } = setup();
    const inbox = task();
    const active = task({ id: 'active', status: 'ACTIVE' });
    repository.tasks.set(inbox.id, inbox);
    repository.tasks.set(active.id, active);
    expect(application.list({ statuses: ['ACTIVE', 'INBOX', 'ACTIVE'] })).toEqual([inbox, active]);
    expect(repository.lastListQuery).toEqual({
      statuses: ['ACTIVE', 'INBOX'],
      limit: 100,
    });
    expect(application.list({ statuses: ['INBOX'], limit: 1 })).toEqual([inbox]);
    expect(application.list({ statuses: ['INBOX'] })).toEqual([inbox]);
    expect(repository.listCalls).toBe(3);
    expect(() => application.list({ statuses: [] })).toThrow(InvalidTaskRequestError);
    expect(() => application.list({ statuses: ['UNKNOWN'] as never })).toThrow(
      InvalidTaskRequestError,
    );
    expect(() => application.list({ statuses: ['INBOX'], limit: 0 })).toThrow(
      InvalidTaskRequestError,
    );
    expect(() => application.list({ statuses: ['INBOX'], limit: 1.5 })).toThrow(
      InvalidTaskRequestError,
    );
    expect(() => application.list({ statuses: ['INBOX'], limit: 201 })).toThrow(
      InvalidTaskRequestError,
    );
  });

  it('preserves omitted workspace and normalizes explicit workspace filters before querying', () => {
    const { application, repository } = setup();

    application.list({ statuses: ['INBOX'] });
    expect(repository.lastListQuery).toEqual({ statuses: ['INBOX'], limit: 100 });

    application.list({ statuses: ['INBOX'], workspace: ' relay ' });
    expect(repository.lastListQuery).toEqual({
      statuses: ['INBOX'],
      workspace: 'relay',
      limit: 100,
    });

    application.list({ statuses: ['INBOX'], workspace: null });
    expect(repository.lastListQuery).toEqual({ statuses: ['INBOX'], workspace: null, limit: 100 });
  });

  it('validates session capture requests and applies the default limit', () => {
    const { application, repository } = setup();
    const capture = task({
      id: 'capture',
      createdByType: 'AGENT',
      createdByName: 'Codex',
      sessionId: 'session-1',
    });
    repository.tasks.set(capture.id, capture);

    expect(application.listSessionCaptures({ sessionId: ' session-1 ' })).toEqual([capture]);
    expect(repository.lastSessionCaptureQuery).toEqual({ sessionId: 'session-1', limit: 100 });
    expect(() => application.listSessionCaptures({ sessionId: 'bad session' })).toThrow(
      TaskValidationError,
    );
    expect(() => application.listSessionCaptures({ sessionId: 'session-1', limit: 101 })).toThrow(
      InvalidTaskRequestError,
    );
  });

  it('normalizes advisory similar-task input and bounds its limit', () => {
    const { application, repository } = setup();

    application.findSimilar({ title: '  Prepare\tRelease!!  ', workspace: ' relay ', limit: 5 });

    expect(repository.lastSimilarQuery).toEqual({
      normalizedTitle: 'prepare release',
      workspace: 'relay',
      limit: 5,
    });
    expect(() => application.findSimilar({ title: ' ', limit: 1 })).toThrow(
      InvalidTaskRequestError,
    );
    expect(() => application.findSimilar({ title: 'Task', limit: 6 })).toThrow(
      InvalidTaskRequestError,
    );
  });

  it('edits only requested metadata, supports null clearing, and skips no-op persistence', () => {
    const { application, repository, clock } = setup();
    const original = task({
      description: 'text',
      priority: 'HIGH',
      workspace: 'relay',
      sourceContext: 'context',
    });
    repository.tasks.set(original.id, original);
    expect(
      application.edit({
        id: original.id,
        title: ' Changed ',
        description: null,
        priority: null,
        workspace: null,
        sourceContext: null,
      }),
    ).toMatchObject({
      title: 'Changed',
      description: null,
      priority: null,
      workspace: null,
      sourceContext: null,
      updatedAt: NOW.toISOString(),
    });
    expect(original.title).toBe('Task');
    expect(repository.updateCalls).toBe(1);
    expect(clock.calls).toBe(1);
    expect(application.edit({ id: original.id, title: 'Changed' })).toMatchObject({
      title: 'Changed',
    });
    expect(repository.updateCalls).toBe(1);
    expect(() => application.edit({ id: original.id })).toThrow(InvalidTaskRequestError);
  });

  it.each([
    ['moveToInbox', task({ status: 'ACTIVE' }), 'INBOX'],
    ['activate', task(), 'ACTIVE'],
    ['start', task({ status: 'ACTIVE' }), 'IN_PROGRESS'],
    ['moveToBacklog', task(), 'BACKLOG'],
    ['complete', task({ status: 'ACTIVE' }), 'DONE'],
    ['archive', task(), 'ARCHIVED'],
  ] as const)('performs explicit %s lifecycle operation', (method, source, status) => {
    const { application, repository } = setup();
    repository.tasks.set(source.id, source);
    expect(application[method]({ id: source.id })).toMatchObject({
      status,
      updatedAt: NOW.toISOString(),
    });
    expect(repository.updateCalls).toBe(1);
  });

  it('skips lifecycle persistence for same-state operations and preserves typed domain errors', () => {
    const { application, repository } = setup();
    const original = task();
    repository.tasks.set('task-1', original);
    expect(application.moveToInbox({ id: 'task-1' })).toBe(original);
    expect(repository.updateCalls).toBe(0);
    expect(() => application.start({ id: 'task-1' })).toThrow(TaskTransitionError);
  });

  it('preserves completed and archived domain restrictions and maps missing mutations to not found', () => {
    const { application, repository } = setup();
    repository.tasks.set(
      'done',
      task({ id: 'done', status: 'DONE', completedAt: NOW.toISOString() }),
    );
    repository.tasks.set(
      'archived',
      task({ id: 'archived', status: 'ARCHIVED', archivedAt: NOW.toISOString() }),
    );

    expect(() => application.activate({ id: 'done' })).toThrow(TaskTransitionError);
    expect(() => application.edit({ id: 'archived', title: 'Nope' })).toThrow(TaskArchivedError);
    expect(() => application.archive({ id: 'missing' })).toThrow(TaskNotFoundError);
  });

  it('maps repository update absence to not found and retains persistence failure causes', () => {
    const { application, repository } = setup();
    repository.tasks.set('task-1', task());
    const notFound = new TaskRepositoryNotFoundError('missing update');
    repository.updateFailure = notFound;
    expect(() => application.activate({ id: 'task-1' })).toThrow(TaskNotFoundError);
    try {
      application.activate({ id: 'task-1' });
    } catch (error) {
      expect((error as TaskNotFoundError).cause).toBe(notFound);
    }

    const persistence = new TaskRepositoryError('database unavailable');
    repository.updateFailure = persistence;
    try {
      application.activate({ id: 'task-1' });
    } catch (error) {
      expect(error).toBeInstanceOf(TaskPersistenceError);
      expect((error as TaskPersistenceError).cause).toBe(persistence);
    }
  });

  it.each(['createFailure', 'findFailure', 'updateFailure', 'listFailure'] as const)(
    'translates %s errors into persistence errors',
    (failure) => {
      const { application, repository } = setup();
      repository[failure] = new TaskRepositoryError('database unavailable');
      repository.tasks.set('task-1', task());
      const invoke =
        failure === 'createFailure'
          ? () => application.create({ title: 'new', creator: { type: 'HUMAN' } })
          : failure === 'findFailure'
            ? () => application.get({ id: 'task-1' })
            : failure === 'updateFailure'
              ? () => application.activate({ id: 'task-1' })
              : () => application.list({ statuses: ['INBOX'] });
      expect(invoke).toThrow(TaskPersistenceError);
    },
  );
});
