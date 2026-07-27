import { Client } from '@modelcontextprotocol/sdk/client/index.js';
import { InMemoryTransport } from '@modelcontextprotocol/sdk/inMemory.js';
import { describe, expect, it, vi } from 'vitest';
import {
  createTaskApplication,
  type TaskApplication,
  type TaskMutationResult,
} from '../../../../src/application/tasks/task-application.js';
import {
  InvalidTaskRequestError,
  TaskNotFoundError,
  TaskPersistenceError,
} from '../../../../src/application/tasks/task-application-errors.js';
import type { Task } from '../../../../src/domain/task/task.js';
import { TaskArchivedError, TaskTransitionError } from '../../../../src/domain/task/task-errors.js';
import { createMcpServer } from '../../../../src/interfaces/mcp/create-mcp-server.js';
import { InMemoryTaskRepository } from '../../application/tasks/task-test-fixtures.js';

function task(overrides: Partial<Task> = {}): Task {
  return {
    id: 'task-1',
    title: 'Prepare release',
    description: null,
    status: 'INBOX',
    priority: null,
    workspace: 'relay',
    sourceContext: null,
    createdByType: 'AGENT',
    createdByName: 'Codex',
    sessionId: 'session-a',
    createdAt: '2026-07-26T10:00:00.000Z',
    updatedAt: '2026-07-26T10:00:00.000Z',
    startedAt: null,
    completedAt: null,
    archivedAt: null,
    ...overrides,
  };
}

async function connect(application: TaskApplication) {
  const server = createMcpServer(application);
  const [clientTransport, serverTransport] = InMemoryTransport.createLinkedPair();
  const client = new Client({ name: 'mutation-handler-test', version: '1.0.0' });
  await Promise.all([server.connect(serverTransport), client.connect(clientTransport)]);
  return { client, close: async () => Promise.all([client.close(), server.close()]) };
}

function mutation(before: Task, taskResult: Task = before): TaskMutationResult {
  return { before, task: taskResult };
}

function readMethods(result: Task) {
  return {
    create: vi.fn(() => result),
    get: vi.fn(() => result),
    list: vi.fn(() => [result]),
    findSimilar: vi.fn(() => []),
    listSessionCaptures: vi.fn(() => [result]),
  };
}

describe('MCP mutation handlers', () => {
  it('calls exactly one canonical application mutation method per tool', async () => {
    const before = task();
    const calls = {
      edit: vi.fn(() => mutation(before)),
      moveToInbox: vi.fn(() => mutation(before)),
      activate: vi.fn(() => mutation(before, task({ status: 'ACTIVE' }))),
      moveToBacklog: vi.fn(() => mutation(before, task({ status: 'BACKLOG' }))),
      start: vi.fn(() => mutation(before, task({ status: 'IN_PROGRESS' }))),
      complete: vi.fn(() => mutation(before, task({ status: 'DONE' }))),
      archive: vi.fn(() => mutation(before, task({ status: 'ARCHIVED' }))),
    };
    const application = {
      ...readMethods(before),
      ...calls,
    } as unknown as TaskApplication;
    const { client, close } = await connect(application);
    try {
      for (const [name, arguments_] of [
        ['task_edit', { taskId: before.id, title: 'Updated' }],
        ['task_triage', { taskId: before.id, target: 'INBOX' }],
        ['task_start', { taskId: before.id }],
        ['task_complete', { taskId: before.id }],
        ['task_archive', { taskId: before.id }],
      ] as const) {
        const result = await client.callTool({ name, arguments: arguments_ });
        expect(result).not.toHaveProperty('isError', true);
      }

      expect(calls.edit).toHaveBeenCalledWith({ id: before.id, title: 'Updated' });
      expect(calls.moveToInbox).toHaveBeenCalledWith({ id: before.id });
      expect(calls.start).toHaveBeenCalledWith({ id: before.id });
      expect(calls.complete).toHaveBeenCalledWith({ id: before.id });
      expect(calls.archive).toHaveBeenCalledWith({ id: before.id });
      expect(calls.activate).not.toHaveBeenCalled();
      expect(calls.moveToBacklog).not.toHaveBeenCalled();

      await client.callTool({
        name: 'task_triage',
        arguments: { taskId: before.id, target: 'ACTIVE' },
      });
      await client.callTool({
        name: 'task_triage',
        arguments: { taskId: before.id, target: 'BACKLOG' },
      });
      expect(calls.activate).toHaveBeenCalledWith({ id: before.id });
      expect(calls.moveToBacklog).toHaveBeenCalledWith({ id: before.id });
    } finally {
      await close();
    }
  });

  it.each([
    ['missing editable field', {}],
    ['direct description null', { description: null }],
    ['direct priority null', { priority: null }],
    ['direct workspace null', { workspace: null }],
    ['direct sourceContext null', { sourceContext: null }],
    ['description clear conflict', { description: 'text', clearDescription: true }],
    ['priority clear conflict', { priority: 'HIGH', clearPriority: true }],
    ['workspace clear conflict', { workspace: 'relay', clearWorkspace: true }],
    ['sourceContext clear conflict', { sourceContext: 'issue', clearSourceContext: true }],
  ] as const)('rejects task_edit %s as SDK invalid params', async (_name, extra) => {
    const result = task();
    const application = {
      ...readMethods(result),
      edit: vi.fn(() => mutation(result)),
    } as unknown as TaskApplication;
    const { client, close } = await connect(application);
    try {
      const response = await client.callTool({
        name: 'task_edit',
        arguments: { taskId: result.id, ...extra },
      });
      expect(response).toMatchObject({ isError: true });
      expect(JSON.stringify(response)).toContain('-32602');
      expect(application.edit).not.toHaveBeenCalled();
    } finally {
      await close();
    }
  });

  it.each([
    ['status', { status: 'DONE' }],
    ['createdByType', { createdByType: 'HUMAN' }],
    ['createdByName', { createdByName: 'Alice' }],
    ['sessionId', { sessionId: 'session-b' }],
    ['createdAt', { createdAt: '2026-07-27T10:00:00.000Z' }],
    ['updatedAt', { updatedAt: '2026-07-27T10:00:00.000Z' }],
    ['startedAt', { startedAt: '2026-07-27T10:00:00.000Z' }],
    ['completedAt', { completedAt: '2026-07-27T10:00:00.000Z' }],
    ['archivedAt', { archivedAt: '2026-07-27T10:00:00.000Z' }],
    ['confirmed', { confirmed: true }],
    ['requestedBy', { requestedBy: 'human' }],
  ] as const)(
    'rejects forbidden task_edit field %s as SDK invalid params',
    async (_field, extra) => {
      const result = task();
      const application = {
        ...readMethods(result),
        edit: vi.fn(() => mutation(result)),
      } as unknown as TaskApplication;
      const { client, close } = await connect(application);
      try {
        const response = await client.callTool({
          name: 'task_edit',
          arguments: { taskId: result.id, title: 'Updated', ...extra },
        });
        expect(response).toMatchObject({ isError: true });
        expect(JSON.stringify(response)).toContain('-32602');
        expect(application.edit).not.toHaveBeenCalled();
      } finally {
        await close();
      }
    },
  );

  it('edits every field, clears nullable fields, preserves field order, and reads back the result', async () => {
    const repository = new InMemoryTaskRepository();
    const application = createTaskApplication({ repository });
    const created = application.create({
      title: 'Original title',
      description: 'Original description',
      priority: 'LOW',
      workspace: 'relay',
      sourceContext: 'original context',
      creator: { type: 'AGENT', name: 'Codex' },
      sessionId: 'session-a',
    });
    const { client, close } = await connect(application);
    try {
      const edited = await client.callTool({
        name: 'task_edit',
        arguments: {
          taskId: created.id,
          sourceContext: 'new context',
          title: 'New title',
          priority: 'HIGH',
        },
      });
      expect(edited).toMatchObject({
        structuredContent: {
          data: {
            task: { title: 'New title', priority: 'HIGH', sourceContext: 'new context' },
            change: { action: 'EDITED', fields: ['title', 'priority', 'sourceContext'] },
          },
        },
      });

      for (const [field, value, expected] of [
        ['title', 'Final title', { title: 'Final title' }],
        ['description', 'Final description', { description: 'Final description' }],
        ['priority', 'NORMAL', { priority: 'NORMAL' }],
        ['workspace', 'final-workspace', { workspace: 'final-workspace' }],
        ['sourceContext', 'final-context', { sourceContext: 'final-context' }],
      ] as const) {
        const response = await client.callTool({
          name: 'task_edit',
          arguments: { taskId: created.id, [field]: value },
        });
        expect(response).toMatchObject({
          structuredContent: {
            data: { task: expected, change: { action: 'EDITED', fields: [field] } },
          },
        });
      }

      for (const [clearField, field] of [
        ['clearDescription', 'description'],
        ['clearPriority', 'priority'],
        ['clearWorkspace', 'workspace'],
        ['clearSourceContext', 'sourceContext'],
      ] as const) {
        const response = await client.callTool({
          name: 'task_edit',
          arguments: { taskId: created.id, [clearField]: true },
        });
        expect(response).toMatchObject({
          structuredContent: {
            data: { task: { [field]: null }, change: { action: 'EDITED', fields: [field] } },
          },
        });
        const readBack = await client.callTool({
          name: 'task_get',
          arguments: { taskId: created.id },
        });
        expect(readBack).toMatchObject({
          structuredContent: { data: { task: { id: created.id, [field]: null } } },
        });
      }
    } finally {
      await close();
    }
  });

  it('returns successful no-op metadata without changing timestamps or persisting', async () => {
    const repository = new InMemoryTaskRepository();
    const application = createTaskApplication({ repository });
    const created = application.create({
      title: 'No-op task',
      description: null,
      priority: null,
      workspace: null,
      sourceContext: null,
      creator: { type: 'AGENT', name: 'Codex' },
      sessionId: 'session-no-op',
    });
    const originalUpdatedAt = created.updatedAt;
    const { client, close } = await connect(application);
    try {
      const edit = await client.callTool({
        name: 'task_edit',
        arguments: { taskId: created.id, title: created.title, clearDescription: true },
      });
      expect(edit).toMatchObject({
        structuredContent: { data: { change: { action: 'NO_CHANGE', fields: [] } } },
      });
      const triage = await client.callTool({
        name: 'task_triage',
        arguments: { taskId: created.id, target: 'INBOX' },
      });
      expect(triage).toMatchObject({
        structuredContent: {
          data: { change: { action: 'NO_CHANGE', from: 'INBOX', to: 'INBOX' } },
        },
      });
      const afterEditUpdatedAt = repository.tasks.get(created.id)?.updatedAt;
      expect(afterEditUpdatedAt).toBe(originalUpdatedAt);

      await client.callTool({
        name: 'task_triage',
        arguments: { taskId: created.id, target: 'ACTIVE' },
      });
      const started = await client.callTool({
        name: 'task_start',
        arguments: { taskId: created.id },
      });
      expect(started).toMatchObject({
        structuredContent: { data: { change: { action: 'STARTED' } } },
      });
      const afterStartUpdatedAt = repository.tasks.get(created.id)?.updatedAt;
      const startedAgain = await client.callTool({
        name: 'task_start',
        arguments: { taskId: created.id },
      });
      expect(startedAgain).toMatchObject({
        structuredContent: { data: { change: { action: 'NO_CHANGE' } } },
      });
      expect(repository.tasks.get(created.id)?.updatedAt).toBe(afterStartUpdatedAt);
      await client.callTool({ name: 'task_complete', arguments: { taskId: created.id } });
      const afterCompleteUpdatedAt = repository.tasks.get(created.id)?.updatedAt;
      const completedAgain = await client.callTool({
        name: 'task_complete',
        arguments: { taskId: created.id },
      });
      expect(completedAgain).toMatchObject({
        structuredContent: { data: { change: { action: 'NO_CHANGE' } } },
      });
      expect(repository.tasks.get(created.id)?.updatedAt).toBe(afterCompleteUpdatedAt);
      await client.callTool({ name: 'task_archive', arguments: { taskId: created.id } });
      const afterArchiveUpdatedAt = repository.tasks.get(created.id)?.updatedAt;
      const archivedAgain = await client.callTool({
        name: 'task_archive',
        arguments: { taskId: created.id },
      });
      expect(archivedAgain).toMatchObject({
        structuredContent: { data: { change: { action: 'NO_CHANGE' } } },
      });
      expect(repository.tasks.get(created.id)?.updatedAt).toBe(afterArchiveUpdatedAt);

      expect(repository.updateCalls).toBe(4);
      expect((edit as { isError?: boolean }).isError).not.toBe(true);
      expect((triage as { isError?: boolean }).isError).not.toBe(true);
      expect((startedAgain as { isError?: boolean }).isError).not.toBe(true);
      expect((completedAgain as { isError?: boolean }).isError).not.toBe(true);
      expect((archivedAgain as { isError?: boolean }).isError).not.toBe(true);
    } finally {
      await close();
    }
  });

  it.each([
    [
      'validation',
      'task_edit',
      { taskId: 'task-1', title: 'Updated' },
      new InvalidTaskRequestError('invalid'),
      'VALIDATION_ERROR',
    ],
    [
      'not found',
      'task_archive',
      { taskId: 'missing' },
      new TaskNotFoundError('missing'),
      'NOT_FOUND',
    ],
    [
      'conflict',
      'task_start',
      { taskId: 'task-1' },
      new TaskTransitionError('wrong state'),
      'CONFLICT',
    ],
    [
      'archived edit',
      'task_edit',
      { taskId: 'task-1', title: 'Updated' },
      new TaskArchivedError('archived internal detail'),
      'ARCHIVED_TASK',
    ],
    [
      'archived triage',
      'task_triage',
      { taskId: 'task-1', target: 'ACTIVE' },
      new TaskArchivedError('archived internal detail'),
      'ARCHIVED_TASK',
    ],
    [
      'archived start',
      'task_start',
      { taskId: 'task-1' },
      new TaskArchivedError('archived internal detail'),
      'ARCHIVED_TASK',
    ],
    [
      'archived complete',
      'task_complete',
      { taskId: 'task-1' },
      new TaskArchivedError('archived internal detail'),
      'ARCHIVED_TASK',
    ],
    [
      'storage',
      'task_edit',
      { taskId: 'task-1', title: 'Updated' },
      new TaskPersistenceError('SQLITE /tmp/relay.db'),
      'STORAGE_ERROR',
    ],
    [
      'internal',
      'task_start',
      { taskId: 'task-1' },
      new Error('secret implementation detail'),
      'INTERNAL_ERROR',
    ],
  ] as const)(
    'maps schema-valid %s execution errors without leaking details',
    async (_name, name, arguments_, error, code) => {
      const result = task();
      const method =
        name === 'task_edit'
          ? 'edit'
          : name === 'task_triage'
            ? 'activate'
            : name === 'task_start'
              ? 'start'
              : name === 'task_complete'
                ? 'complete'
                : 'archive';
      const application = {
        ...readMethods(result),
        [method]: vi.fn(() => {
          throw error;
        }),
      } as unknown as TaskApplication;
      const { client, close } = await connect(application);
      try {
        const response = await client.callTool({ name, arguments: arguments_ });
        expect(response).toMatchObject({
          isError: true,
          structuredContent: { error: { code } },
        });
        expect(JSON.stringify(response)).not.toContain(error.message);
        expect(JSON.stringify(response)).not.toMatch(/SQLITE|relay\.db|stack/i);
      } finally {
        await close();
      }
    },
  );

  it.each([
    ['task_start', { taskId: 'task-1', unknown: true }],
    ['task_complete', { taskId: 'task-1', unknown: true }],
    ['task_archive', { taskId: 'task-1', unknown: true }],
  ] as const)('rejects unknown fields for %s as SDK invalid params', async (name, arguments_) => {
    const result = task();
    const application = {
      ...readMethods(result),
      start: vi.fn(),
      complete: vi.fn(),
      archive: vi.fn(),
    } as unknown as TaskApplication;
    const { client, close } = await connect(application);
    try {
      const response = await client.callTool({ name, arguments: arguments_ });
      expect(response).toMatchObject({ isError: true });
      expect(JSON.stringify(response)).toContain('-32602');
    } finally {
      await close();
    }
  });
});
