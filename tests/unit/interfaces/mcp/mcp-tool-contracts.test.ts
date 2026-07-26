import { Client } from '@modelcontextprotocol/sdk/client/index.js';
import { InMemoryTransport } from '@modelcontextprotocol/sdk/inMemory.js';
import { describe, expect, it, vi } from 'vitest';
import type { TaskApplication } from '../../../../src/application/tasks/task-application.js';
import {
  InvalidTaskRequestError,
  TaskNotFoundError,
  TaskPersistenceError,
} from '../../../../src/application/tasks/task-application-errors.js';
import type { Task } from '../../../../src/domain/task/task.js';
import { TaskValidationError } from '../../../../src/domain/task/task-errors.js';
import { createMcpServer } from '../../../../src/interfaces/mcp/create-mcp-server.js';
import {
  sessionCapturesOutputSchema,
  taskCaptureOutputSchema,
  taskFindSimilarOutputSchema,
  taskGetOutputSchema,
  taskListOutputSchema,
} from '../../../../src/interfaces/mcp/schemas/read-tool-schemas.js';
import { ZodError } from 'zod';

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

function taskApplication(overrides: Partial<TaskApplication> = {}): TaskApplication {
  const result = task();
  return {
    create: vi.fn(() => result),
    get: vi.fn(() => result),
    list: vi.fn(() => [result]),
    findSimilar: vi.fn(() => []),
    listSessionCaptures: vi.fn(() => [result]),
    edit: vi.fn(),
    moveToInbox: vi.fn(),
    activate: vi.fn(),
    start: vi.fn(),
    moveToBacklog: vi.fn(),
    complete: vi.fn(),
    archive: vi.fn(),
    ...overrides,
  } as unknown as TaskApplication;
}

async function createConnectedMcpTestServer(application: TaskApplication) {
  const server = createMcpServer(application);
  const [clientTransport, serverTransport] = InMemoryTransport.createLinkedPair();
  const client = new Client({ name: 'mcp-contract-test', version: '1.0.0' });
  await Promise.all([server.connect(serverTransport), client.connect(clientTransport)]);
  return {
    client,
    close: async () => {
      await client.close();
      await server.close();
    },
  };
}

function structured(result: unknown): Record<string, unknown> {
  return (result as { structuredContent: Record<string, unknown> }).structuredContent;
}

function expectCompatibilityText(result: unknown): void {
  const response = result as {
    content: Array<{ type: string; text?: string }>;
    structuredContent: Record<string, unknown>;
  };
  expect(response.content).toHaveLength(1);
  expect(response.content[0]).toEqual({
    type: 'text',
    text: JSON.stringify(response.structuredContent),
  });
}

const executionErrors = [
  [new ZodError([]), 'VALIDATION_ERROR'],
  [
    new InvalidTaskRequestError('SQLITE_CONSTRAINT /tmp/relay.db super-secret-token'),
    'VALIDATION_ERROR',
  ],
  [
    new TaskValidationError('title', 'SQLITE_CONSTRAINT /tmp/relay.db super-secret-token'),
    'VALIDATION_ERROR',
  ],
  [new TaskNotFoundError('SQLITE_CONSTRAINT /tmp/relay.db super-secret-token'), 'NOT_FOUND'],
  [new TaskPersistenceError('SQLITE_CONSTRAINT /tmp/relay.db super-secret-token'), 'STORAGE_ERROR'],
  [new Error('SQLITE_CONSTRAINT /tmp/relay.db super-secret-token'), 'INTERNAL_ERROR'],
] as const;

describe('MCP task tool contracts', () => {
  it('preserves capture provenance, checks duplicates before creation, and returns advisory warnings', async () => {
    const calls: string[] = [];
    let capturedInput: unknown;
    const application = taskApplication({
      findSimilar: vi.fn(() => {
        calls.push('findSimilar');
        return [task({ id: 'existing' })];
      }),
      create: vi.fn((input) => {
        calls.push('create');
        capturedInput = input;
        return task({ sourceContext: 'issue-26' });
      }),
    });
    const { client, close } = await createConnectedMcpTestServer(application);
    try {
      const result = await client.callTool({
        name: 'task_capture',
        arguments: {
          title: 'Prepare release',
          createdByName: 'Codex',
          sessionId: 'session-a',
          sourceContext: 'issue-26',
        },
      });
      taskCaptureOutputSchema.parse(structured(result));
      expectCompatibilityText(result);
      expect(calls).toEqual(['findSimilar', 'create']);
      expect(capturedInput).toMatchObject({
        creator: { type: 'AGENT', name: 'Codex' },
        sessionId: 'session-a',
        sourceContext: 'issue-26',
      });
      expect(capturedInput).not.toHaveProperty('status');
      expect(structured(result)).toMatchObject({
        data: { change: { action: 'CREATED' } },
        warnings: [{ code: 'POSSIBLE_DUPLICATE', candidates: [{ id: 'existing' }] }],
      });
    } finally {
      await close();
    }
  });

  it('returns no capture warning when the advisory lookup has no candidates', async () => {
    const { client, close } = await createConnectedMcpTestServer(taskApplication());
    try {
      const result = await client.callTool({
        name: 'task_capture',
        arguments: { title: 'Prepare release', createdByName: 'Codex', sessionId: 'session-a' },
      });
      expect(structured(result)).toMatchObject({ warnings: [] });
      expect((result as { isError?: boolean }).isError).not.toBe(true);
    } finally {
      await close();
    }
  });

  it('uses SDK invalid-parameter responses without invoking the application for unsafe input', async () => {
    const application = taskApplication();
    const { client, close } = await createConnectedMcpTestServer(application);
    try {
      const result = await client.callTool({
        name: 'task_capture',
        arguments: {
          title: 'Prepare release',
          createdByName: 'Codex',
          sessionId: 'session-a',
          creator: { type: 'HUMAN' },
        },
      });
      expect(result).toMatchObject({ isError: true });
      expect(JSON.stringify(result)).toContain('-32602');
      expect(application.findSimilar).not.toHaveBeenCalled();
      expect(application.create).not.toHaveBeenCalled();
    } finally {
      await close();
    }
  });

  it.each([
    ['caller-controlled status', { status: 'DONE' }],
    ['caller-controlled creator', { creator: { type: 'HUMAN' } }],
    ['caller-controlled creator type', { createdByType: 'HUMAN' }],
    ['unknown property', { unrelated: true }],
    ['empty title', { title: '   ' }],
    ['title above the maximum', { title: 'x'.repeat(301) }],
    ['creator name above the maximum', { createdByName: 'x'.repeat(101) }],
    ['malformed session id', { sessionId: 'not a valid session' }],
    ['workspace above the maximum', { workspace: 'x'.repeat(256) }],
    ['source context above the maximum', { sourceContext: 'x'.repeat(1001) }],
  ])('rejects capture %s before application execution', async (_name, invalidArgument) => {
    const application = taskApplication();
    const { client, close } = await createConnectedMcpTestServer(application);
    try {
      const result = await client.callTool({
        name: 'task_capture',
        arguments: {
          title: 'Prepare release',
          createdByName: 'Codex',
          sessionId: 'session-a',
          ...invalidArgument,
        },
      });
      expect(result).toMatchObject({ isError: true });
      expect(JSON.stringify(result)).toContain('-32602');
      expect(application.findSimilar).not.toHaveBeenCalled();
      expect(application.create).not.toHaveBeenCalled();
    } finally {
      await close();
    }
  });

  it.each([
    ['missing all required fields', {}],
    ['missing title', { createdByName: 'Codex', sessionId: 'session-a' }],
    ['missing creator name', { title: 'Prepare release', sessionId: 'session-a' }],
    ['missing session id', { title: 'Prepare release', createdByName: 'Codex' }],
    [
      'empty creator name',
      { title: 'Prepare release', createdByName: '   ', sessionId: 'session-a' },
    ],
    [
      'empty description',
      { title: 'Prepare release', createdByName: 'Codex', sessionId: 'session-a', description: '' },
    ],
    [
      'description above the maximum',
      {
        title: 'Prepare release',
        createdByName: 'Codex',
        sessionId: 'session-a',
        description: 'x'.repeat(10001),
      },
    ],
    [
      'invalid priority',
      {
        title: 'Prepare release',
        createdByName: 'Codex',
        sessionId: 'session-a',
        priority: 'URGENT',
      },
    ],
    [
      'empty workspace',
      { title: 'Prepare release', createdByName: 'Codex', sessionId: 'session-a', workspace: '' },
    ],
    [
      'empty source context',
      {
        title: 'Prepare release',
        createdByName: 'Codex',
        sessionId: 'session-a',
        sourceContext: '',
      },
    ],
  ])('rejects capture %s before application execution', async (_name, arguments_) => {
    const application = taskApplication();
    const { client, close } = await createConnectedMcpTestServer(application);
    try {
      const result = await client.callTool({ name: 'task_capture', arguments: arguments_ });
      expect(result).toMatchObject({ isError: true });
      expect(JSON.stringify(result)).toContain('-32602');
      expect(application.findSimilar).not.toHaveBeenCalled();
      expect(application.create).not.toHaveBeenCalled();
    } finally {
      await close();
    }
  });

  it('validates every successful read-tool output and compatibility text', async () => {
    const result = task();
    const application = taskApplication({
      findSimilar: vi.fn(() => [result]),
      listSessionCaptures: vi.fn(() => [result]),
    });
    const { client, close } = await createConnectedMcpTestServer(application);
    try {
      const get = await client.callTool({ name: 'task_get', arguments: { taskId: result.id } });
      const list = await client.callTool({
        name: 'task_list',
        arguments: { statuses: ['INBOX'], workspace: ' relay ', limit: 1 },
      });
      const similar = await client.callTool({
        name: 'task_find_similar',
        arguments: { title: result.title, workspace: 'relay', limit: 5 },
      });
      const session = await client.callTool({
        name: 'session_captures_list',
        arguments: { sessionId: 'session-a' },
      });
      taskGetOutputSchema.parse(structured(get));
      taskListOutputSchema.parse(structured(list));
      taskFindSimilarOutputSchema.parse(structured(similar));
      sessionCapturesOutputSchema.parse(structured(session));
      for (const response of [get, list, similar, session]) expectCompatibilityText(response);
      expect(application.list).toHaveBeenCalledWith({
        statuses: ['INBOX'],
        workspace: 'relay',
        limit: 1,
      });
      expect(application.findSimilar).toHaveBeenCalledWith({
        title: result.title,
        workspace: 'relay',
        limit: 5,
      });
    } finally {
      await close();
    }
  });

  it('preserves list defaults, explicit null workspace, and normalized workspace filters', async () => {
    const application = taskApplication();
    const { client, close } = await createConnectedMcpTestServer(application);
    try {
      await client.callTool({ name: 'task_list', arguments: {} });
      await client.callTool({ name: 'task_list', arguments: { workspace: null } });
      await client.callTool({ name: 'task_list', arguments: { workspace: ' relay ' } });
      expect(application.list).toHaveBeenNthCalledWith(1, {
        statuses: ['INBOX', 'ACTIVE', 'IN_PROGRESS', 'BACKLOG', 'DONE', 'ARCHIVED'],
        limit: 100,
      });
      expect(application.list).toHaveBeenNthCalledWith(2, {
        statuses: ['INBOX', 'ACTIVE', 'IN_PROGRESS', 'BACKLOG', 'DONE', 'ARCHIVED'],
        workspace: null,
        limit: 100,
      });
      expect(application.list).toHaveBeenNthCalledWith(3, {
        statuses: ['INBOX', 'ACTIVE', 'IN_PROGRESS', 'BACKLOG', 'DONE', 'ARCHIVED'],
        workspace: 'relay',
        limit: 100,
      });
    } finally {
      await close();
    }
  });

  it('maps a missing task to the stable read-tool error envelope', async () => {
    const application = taskApplication({
      get: vi.fn(() => {
        throw new TaskNotFoundError('missing');
      }),
    });
    const { client, close } = await createConnectedMcpTestServer(application);
    try {
      const result = await client.callTool({ name: 'task_get', arguments: { taskId: 'missing' } });
      expect(result).toMatchObject({
        isError: true,
        structuredContent: {
          schemaVersion: 1,
          error: { code: 'NOT_FOUND', message: 'Task was not found.' },
        },
      });
      expectCompatibilityText(result);
    } finally {
      await close();
    }
  });

  it('returns stable exact and normalized similar-task reasons', async () => {
    const exact = task({ id: 'exact', title: 'Prepare release' });
    const normalized = task({ id: 'normalized', title: 'Prepare release!!!' });
    const application = taskApplication({ findSimilar: vi.fn(() => [exact, normalized]) });
    const { client, close } = await createConnectedMcpTestServer(application);
    try {
      const result = await client.callTool({
        name: 'task_find_similar',
        arguments: { title: 'Prepare release' },
      });
      expect(structured(result)).toMatchObject({
        data: {
          candidates: [
            { task: { id: 'exact' }, matchReason: 'EXACT_TITLE' },
            { task: { id: 'normalized' }, matchReason: 'NORMALIZED_TITLE' },
          ],
        },
      });
      expectCompatibilityText(result);
    } finally {
      await close();
    }
  });

  it.each([
    ['task_get', { taskId: '' }, 'get'],
    ['task_get', {}, 'get'],
    ['task_get', { taskId: 'x'.repeat(101) }, 'get'],
    ['task_get', { taskId: 'task-1', unknown: true }, 'get'],
    ['task_list', { statuses: [] }, 'list'],
    ['task_list', { statuses: ['INBOX', 'INBOX'] }, 'list'],
    ['task_list', { statuses: ['UNKNOWN'] }, 'list'],
    ['task_list', { limit: 0 }, 'list'],
    ['task_list', { limit: 101 }, 'list'],
    ['task_list', { limit: 1.5 }, 'list'],
    ['task_list', { workspace: '' }, 'list'],
    ['task_list', { workspace: 'x'.repeat(256) }, 'list'],
    ['task_list', { unknown: true }, 'list'],
    ['task_find_similar', { title: '' }, 'findSimilar'],
    ['task_find_similar', {}, 'findSimilar'],
    ['task_find_similar', { title: 'x'.repeat(301) }, 'findSimilar'],
    ['task_find_similar', { title: 'Prepare release', workspace: '' }, 'findSimilar'],
    ['task_find_similar', { title: 'Prepare release', workspace: 'x'.repeat(256) }, 'findSimilar'],
    ['task_find_similar', { title: 'Prepare release', limit: 0 }, 'findSimilar'],
    ['task_find_similar', { title: 'Prepare release', limit: 6 }, 'findSimilar'],
    ['task_find_similar', { title: 'Prepare release', limit: 1.5 }, 'findSimilar'],
    ['task_find_similar', { title: 'Prepare release', unknown: true }, 'findSimilar'],
    ['session_captures_list', {}, 'listSessionCaptures'],
    ['session_captures_list', { sessionId: 'bad session' }, 'listSessionCaptures'],
    ['session_captures_list', { sessionId: 'x'.repeat(129) }, 'listSessionCaptures'],
    ['session_captures_list', { sessionId: 'session-a', limit: 0 }, 'listSessionCaptures'],
    ['session_captures_list', { sessionId: 'session-a', limit: 101 }, 'listSessionCaptures'],
    ['session_captures_list', { sessionId: 'session-a', limit: 1.5 }, 'listSessionCaptures'],
    ['session_captures_list', { sessionId: 'session-a', unknown: true }, 'listSessionCaptures'],
  ] as const)(
    'rejects invalid %s arguments before calling %s',
    async (name, arguments_, method) => {
      const application = taskApplication();
      const { client, close } = await createConnectedMcpTestServer(application);
      try {
        const result = await client.callTool({ name, arguments: arguments_ });
        expect(result).toMatchObject({ isError: true });
        expect(JSON.stringify(result)).toContain('-32602');
        expect(application[method]).not.toHaveBeenCalled();
      } finally {
        await close();
      }
    },
  );

  it.each([
    [
      'task_capture',
      { title: 'Prepare release', createdByName: 'Codex', sessionId: 'session-a' },
      'findSimilar',
    ],
    ['task_list', {}, 'list'],
    ['task_get', { taskId: 'task-1' }, 'get'],
    ['task_find_similar', { title: 'Prepare release' }, 'findSimilar'],
    ['session_captures_list', { sessionId: 'session-a' }, 'listSessionCaptures'],
  ] as const)(
    'maps every stable execution error category for %s without leaking internals',
    async (name, arguments_, method) => {
      for (const [error, code] of executionErrors) {
        const application = taskApplication({
          [method]: vi.fn(() => {
            throw error;
          }),
        } as Partial<TaskApplication>);
        const { client, close } = await createConnectedMcpTestServer(application);
        try {
          const result = await client.callTool({ name, arguments: arguments_ });
          expect(result).toMatchObject({
            isError: true,
            structuredContent: { schemaVersion: 1, error: { code } },
          });
          expectCompatibilityText(result);
          expect(JSON.stringify(result)).not.toMatch(/SQLITE|relay\.db|super-secret-token|stack/i);
        } finally {
          await close();
        }
      }
    },
  );
});
