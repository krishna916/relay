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
import { createMcpServer } from '../../../../src/interfaces/mcp/create-mcp-server.js';
import {
  sessionCapturesOutputSchema,
  taskCaptureOutputSchema,
  taskFindSimilarOutputSchema,
  taskGetOutputSchema,
  taskListOutputSchema,
} from '../../../../src/interfaces/mcp/schemas/read-tool-schemas.js';

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

describe('MCP task tool contracts', () => {
  it('preserves capture provenance, checks duplicates before creation, and returns advisory warnings', async () => {
    const calls: string[] = [];
    const application = taskApplication({
      findSimilar: vi.fn(() => {
        calls.push('findSimilar');
        return [task({ id: 'existing' })];
      }),
      create: vi.fn((input) => {
        calls.push('create');
        expect(input).toMatchObject({
          creator: { type: 'AGENT', name: 'Codex' },
          sessionId: 'session-a',
          sourceContext: 'issue-26',
        });
        expect(input).not.toHaveProperty('status');
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

  it.each([
    [
      new InvalidTaskRequestError('SQLITE_CONSTRAINT /tmp/relay.db super-secret-token'),
      'VALIDATION_ERROR',
    ],
    [new TaskNotFoundError('SQLITE_CONSTRAINT /tmp/relay.db super-secret-token'), 'NOT_FOUND'],
    [
      new TaskPersistenceError('SQLITE_CONSTRAINT /tmp/relay.db super-secret-token'),
      'STORAGE_ERROR',
    ],
    [new Error('SQLITE_CONSTRAINT /tmp/relay.db super-secret-token'), 'INTERNAL_ERROR'],
  ])('maps schema-valid execution errors without leaking internals', async (error, code) => {
    const application = taskApplication({
      get: vi.fn(() => {
        throw error;
      }),
    });
    const { client, close } = await createConnectedMcpTestServer(application);
    try {
      const result = await client.callTool({ name: 'task_get', arguments: { taskId: 'task-1' } });
      expect(result).toMatchObject({ isError: true, structuredContent: { error: { code } } });
      expectCompatibilityText(result);
      expect(JSON.stringify(result)).not.toMatch(/SQLITE|relay\.db|super-secret-token|stack/i);
    } finally {
      await close();
    }
  });
});
