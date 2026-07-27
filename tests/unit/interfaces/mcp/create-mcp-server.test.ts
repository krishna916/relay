import { describe, it, expect } from 'vitest';
import { Client } from '@modelcontextprotocol/sdk/client/index.js';
import { InMemoryTransport } from '@modelcontextprotocol/sdk/inMemory.js';
import { createMcpServer } from '../../../../src/interfaces/mcp/create-mcp-server.js';
import { createTaskApplication } from '../../../../src/application/tasks/task-application.js';
import { InMemoryTaskRepository } from '../../application/tasks/task-test-fixtures.js';
import { TaskRepositoryError } from '../../../../src/application/tasks/task-repository-errors.js';

async function connectMcp(server: ReturnType<typeof createMcpServer>) {
  const [clientTransport, serverTransport] = InMemoryTransport.createLinkedPair();
  const client = new Client({ name: 'test-client', version: '1.0.0' });
  let closed = false;
  const close = async () => {
    if (closed) return;
    closed = true;
    await Promise.allSettled([client.close(), server.close()]);
  };
  try {
    await Promise.all([server.connect(serverTransport), client.connect(clientTransport)]);
    return { client, close };
  } catch (error) {
    await close();
    throw error;
  }
}

describe('createMcpServer', () => {
  it('exposes relay_health tool via in-memory transport', async () => {
    const server = createMcpServer({
      ...createTaskApplication({ repository: new InMemoryTaskRepository() }),
    });
    const { client, close } = await connectMcp(server);
    try {
      const tools = await client.listTools();
      expect(tools.tools.some((t) => t.name === 'relay_health')).toBe(true);

      const result = (await client.callTool({ name: 'relay_health', arguments: {} })) as {
        content: Array<{ type: string; text: string }>;
      };
      expect(result.content[0]?.type).toBe('text');
      if (result.content[0]?.type === 'text') {
        const parsed = JSON.parse(result.content[0].text) as {
          name: string;
          status: string;
          version: string;
        };
        expect(parsed).toEqual({ name: 'relay', status: 'ok', version: '0.1.0' });
      }
    } finally {
      await close();
    }
  });

  it('exposes the five approved task tools', async () => {
    const server = createMcpServer(
      createTaskApplication({ repository: new InMemoryTaskRepository() }),
    );
    const { client, close } = await connectMcp(server);
    try {
      const tools = await client.listTools();
      expect(tools.tools.map((tool) => tool.name)).toEqual(
        expect.arrayContaining([
          'relay_health',
          'task_capture',
          'task_list',
          'task_get',
          'task_find_similar',
          'session_captures_list',
        ]),
      );
    } finally {
      await close();
    }
  });

  it('exposes only the five intent-specific user-directed mutation tools', async () => {
    const server = createMcpServer(
      createTaskApplication({ repository: new InMemoryTaskRepository() }),
    );
    const { client, close } = await connectMcp(server);
    try {
      const tools = await client.listTools();
      const byName = new Map(tools.tools.map((tool) => [tool.name, tool]));

      expect([...byName.keys()]).toEqual(
        expect.arrayContaining([
          'task_edit',
          'task_triage',
          'task_start',
          'task_complete',
          'task_archive',
        ]),
      );
      expect(byName.get('task_edit')?.inputSchema).toMatchObject({
        additionalProperties: false,
        required: ['taskId'],
      });
      expect(byName.get('task_edit')?.inputSchema.properties).not.toHaveProperty('status');
      expect(byName.get('task_edit')?.inputSchema.properties).not.toHaveProperty('sessionId');
      expect(byName.get('task_edit')?.inputSchema.properties).not.toHaveProperty('createdAt');
      expect(byName.get('task_triage')?.inputSchema.properties?.target).toMatchObject({
        enum: ['INBOX', 'ACTIVE', 'BACKLOG'],
      });
      expect([...byName.keys()]).not.toContain('task_update');
      expect([...byName.keys()]).not.toContain('task_set_status');
    } finally {
      await close();
    }
  });

  it('advertises the strict capture and bounded read-tool contracts', async () => {
    const server = createMcpServer(
      createTaskApplication({ repository: new InMemoryTaskRepository() }),
    );
    const { client, close } = await connectMcp(server);
    try {
      const tools = await client.listTools();
      const capture = tools.tools.find((tool) => tool.name === 'task_capture');
      const list = tools.tools.find((tool) => tool.name === 'task_list');
      const similar = tools.tools.find((tool) => tool.name === 'task_find_similar');

      expect(capture?.inputSchema).toMatchObject({
        additionalProperties: false,
        required: expect.arrayContaining(['title', 'createdByName', 'sessionId']),
      });
      expect(capture?.inputSchema.properties).not.toHaveProperty('status');
      expect(capture?.inputSchema.properties).not.toHaveProperty('creator');
      expect(list?.inputSchema.properties?.limit).toMatchObject({ minimum: 1, maximum: 100 });
      expect(similar?.inputSchema.properties?.limit).toMatchObject({ minimum: 1, maximum: 5 });
    } finally {
      await close();
    }
  });

  it('rejects an unsafe capture field as an MCP invalid-parameter error', async () => {
    const server = createMcpServer(
      createTaskApplication({ repository: new InMemoryTaskRepository() }),
    );
    const { client, close } = await connectMcp(server);
    try {
      const result = (await client.callTool({
        name: 'task_capture',
        arguments: {
          title: 'Capture safely',
          createdByName: 'Codex',
          sessionId: 'session-26',
          status: 'DONE',
        },
      })) as { isError?: boolean; content: Array<{ type: string; text?: string }> };
      expect(result.isError).toBe(true);
      expect(result.content[0]?.text).toContain('MCP error -32602');
    } finally {
      await close();
    }
  });

  it('captures a task and exposes it through each approved read tool', async () => {
    const server = createMcpServer(
      createTaskApplication({ repository: new InMemoryTaskRepository() }),
    );
    const { client, close } = await connectMcp(server);
    try {
      const capture = (await client.callTool({
        name: 'task_capture',
        arguments: {
          title: 'Prepare issue twenty six',
          createdByName: 'Codex',
          sessionId: 'session-26',
          workspace: 'relay',
        },
      })) as unknown as {
        structuredContent: { schemaVersion: number; data: { task: { id: string } } };
      };
      const taskId = capture.structuredContent.data.task.id;

      expect(capture.structuredContent.schemaVersion).toBe(1);
      expect(
        (await client.callTool({ name: 'task_get', arguments: { taskId } })) as unknown as {
          structuredContent: { data: { task: { id: string } } };
        },
      ).toMatchObject({ structuredContent: { data: { task: { id: taskId } } } });
      expect(
        (await client.callTool({
          name: 'task_list',
          arguments: { statuses: ['INBOX'], workspace: 'relay' },
        })) as unknown as { structuredContent: { data: { count: number } } },
      ).toMatchObject({ structuredContent: { data: { count: 1 } } });
      expect(
        (await client.callTool({
          name: 'task_find_similar',
          arguments: { title: 'Prepare issue twenty six' },
        })) as unknown as { structuredContent: { data: { candidates: unknown[] } } },
      ).toMatchObject({ structuredContent: { data: { candidates: [expect.anything()] } } });
      expect(
        (await client.callTool({
          name: 'session_captures_list',
          arguments: { sessionId: 'session-26' },
        })) as unknown as { structuredContent: { data: { sessionId: string; count: number } } },
      ).toMatchObject({ structuredContent: { data: { sessionId: 'session-26', count: 1 } } });
    } finally {
      await close();
    }
  });

  it('edits and transitions a task through focused mutation tools with deterministic metadata', async () => {
    const server = createMcpServer(
      createTaskApplication({ repository: new InMemoryTaskRepository() }),
    );
    const { client, close } = await connectMcp(server);
    try {
      const capture = (await client.callTool({
        name: 'task_capture',
        arguments: { title: 'Mutate safely', createdByName: 'Codex', sessionId: 'session-21' },
      })) as unknown as { structuredContent: { data: { task: { id: string } } } };
      const taskId = capture.structuredContent.data.task.id;

      expect(
        (await client.callTool({
          name: 'task_edit',
          arguments: { taskId, title: 'Mutated safely', description: 'Draft description' },
        })) as unknown as {
          structuredContent: { data: { task: { title: string }; change: unknown } };
        },
      ).toMatchObject({
        structuredContent: {
          data: {
            task: { title: 'Mutated safely' },
            change: { action: 'EDITED', fields: ['title', 'description'] },
          },
        },
      });
      expect(
        (await client.callTool({
          name: 'task_edit',
          arguments: { taskId, title: 'Mutated safely' },
        })) as unknown as {
          structuredContent: { data: { change: unknown } };
        },
      ).toMatchObject({
        structuredContent: { data: { change: { action: 'NO_CHANGE', fields: [] } } },
      });
      expect(
        (await client.callTool({
          name: 'task_edit',
          arguments: { taskId, clearDescription: true },
        })) as unknown as {
          structuredContent: { data: { task: { description: null }; change: unknown } };
        },
      ).toMatchObject({
        structuredContent: {
          data: {
            task: { description: null },
            change: { action: 'EDITED', fields: ['description'] },
          },
        },
      });

      expect(
        (await client.callTool({
          name: 'task_triage',
          arguments: { taskId, target: 'ACTIVE' },
        })) as unknown as {
          structuredContent: { data: { task: { status: string }; change: unknown } };
        },
      ).toMatchObject({
        structuredContent: {
          data: {
            task: { status: 'ACTIVE' },
            change: { action: 'TRIAGED', from: 'INBOX', to: 'ACTIVE' },
          },
        },
      });
      expect(
        (await client.callTool({ name: 'task_start', arguments: { taskId } })) as unknown as {
          structuredContent: { data: { task: { status: string }; change: unknown } };
        },
      ).toMatchObject({
        structuredContent: {
          data: { task: { status: 'IN_PROGRESS' }, change: { action: 'STARTED' } },
        },
      });
      expect(
        (await client.callTool({ name: 'task_start', arguments: { taskId } })) as unknown as {
          structuredContent: { data: { change: unknown } };
        },
      ).toMatchObject({ structuredContent: { data: { change: { action: 'NO_CHANGE' } } } });
      expect(
        (await client.callTool({ name: 'task_complete', arguments: { taskId } })) as unknown as {
          structuredContent: { data: { task: { status: string }; change: unknown } };
        },
      ).toMatchObject({
        structuredContent: { data: { task: { status: 'DONE' }, change: { action: 'COMPLETED' } } },
      });
      expect(
        (await client.callTool({ name: 'task_archive', arguments: { taskId } })) as unknown as {
          structuredContent: { data: { task: { status: string }; change: unknown } };
        },
      ).toMatchObject({
        structuredContent: {
          data: { task: { status: 'ARCHIVED' }, change: { action: 'ARCHIVED' } },
        },
      });

      const archivedEdit = (await client.callTool({
        name: 'task_edit',
        arguments: { taskId, title: 'No longer mutable' },
      })) as unknown as { isError?: boolean; structuredContent: { error: { code: string } } };
      expect(archivedEdit).toMatchObject({
        isError: true,
        structuredContent: { error: { code: 'ARCHIVED_TASK' } },
      });
    } finally {
      await close();
    }
  });

  it('maps mutation validation, conflict, missing, and storage failures without leaking internals', async () => {
    const repository = new InMemoryTaskRepository();
    const server = createMcpServer(createTaskApplication({ repository }));
    const { client, close } = await connectMcp(server);
    try {
      const capture = (await client.callTool({
        name: 'task_capture',
        arguments: { title: 'Error mapping', createdByName: 'Codex', sessionId: 'session-errors' },
      })) as unknown as { structuredContent: { data: { task: { id: string } } } };
      const taskId = capture.structuredContent.data.task.id;

      const invalid = await client.callTool({
        name: 'task_edit',
        arguments: { taskId, title: 'Invalid', status: 'DONE' },
      });
      expect(invalid).toMatchObject({ isError: true });

      const conflict = (await client.callTool({
        name: 'task_start',
        arguments: { taskId },
      })) as unknown as {
        isError: boolean;
        structuredContent: { error: { code: string; message: string } };
      };
      expect(conflict).toMatchObject({
        isError: true,
        structuredContent: {
          error: { code: 'CONFLICT', message: 'Task lifecycle transition is not allowed.' },
        },
      });

      const missing = (await client.callTool({
        name: 'task_archive',
        arguments: { taskId: 'missing' },
      })) as unknown as { structuredContent: { error: { code: string } } };
      expect(missing).toMatchObject({ structuredContent: { error: { code: 'NOT_FOUND' } } });

      repository.updateFailure = new TaskRepositoryError('database path must remain private');
      const storage = (await client.callTool({
        name: 'task_triage',
        arguments: { taskId, target: 'ACTIVE' },
      })) as unknown as { structuredContent: { error: { code: string; message: string } } };
      expect(storage).toMatchObject({
        structuredContent: {
          error: { code: 'STORAGE_ERROR', message: 'Task storage operation failed.' },
        },
      });
      expect(JSON.stringify(storage)).not.toContain('database path must remain private');
    } finally {
      await close();
    }
  });
});
