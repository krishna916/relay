import { describe, it, expect } from 'vitest';
import { Client } from '@modelcontextprotocol/sdk/client/index.js';
import { InMemoryTransport } from '@modelcontextprotocol/sdk/inMemory.js';
import { createMcpServer } from '../../../../src/interfaces/mcp/create-mcp-server.js';
import { createTaskApplication } from '../../../../src/application/tasks/task-application.js';
import { InMemoryTaskRepository } from '../../application/tasks/task-test-fixtures.js';

describe('createMcpServer', () => {
  it('exposes relay_health tool via in-memory transport', async () => {
    const server = createMcpServer({
      ...createTaskApplication({ repository: new InMemoryTaskRepository() }),
    });
    const [clientTransport, serverTransport] = InMemoryTransport.createLinkedPair();

    const client = new Client({ name: 'test-client', version: '1.0.0' });

    await Promise.all([server.connect(serverTransport), client.connect(clientTransport)]);

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
  });

  it('exposes the five approved task tools', async () => {
    const server = createMcpServer(
      createTaskApplication({ repository: new InMemoryTaskRepository() }),
    );
    const [clientTransport, serverTransport] = InMemoryTransport.createLinkedPair();
    const client = new Client({ name: 'test-client', version: '1.0.0' });
    await Promise.all([server.connect(serverTransport), client.connect(clientTransport)]);
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
  });

  it('advertises the strict capture and bounded read-tool contracts', async () => {
    const server = createMcpServer(
      createTaskApplication({ repository: new InMemoryTaskRepository() }),
    );
    const [clientTransport, serverTransport] = InMemoryTransport.createLinkedPair();
    const client = new Client({ name: 'test-client', version: '1.0.0' });
    await Promise.all([server.connect(serverTransport), client.connect(clientTransport)]);

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
  });

  it('rejects an unsafe capture field as an MCP invalid-parameter error', async () => {
    const server = createMcpServer(
      createTaskApplication({ repository: new InMemoryTaskRepository() }),
    );
    const [clientTransport, serverTransport] = InMemoryTransport.createLinkedPair();
    const client = new Client({ name: 'test-client', version: '1.0.0' });
    await Promise.all([server.connect(serverTransport), client.connect(clientTransport)]);

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
  });

  it('captures a task and exposes it through each approved read tool', async () => {
    const server = createMcpServer(
      createTaskApplication({ repository: new InMemoryTaskRepository() }),
    );
    const [clientTransport, serverTransport] = InMemoryTransport.createLinkedPair();
    const client = new Client({ name: 'test-client', version: '1.0.0' });
    await Promise.all([server.connect(serverTransport), client.connect(clientTransport)]);

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
  });
});
