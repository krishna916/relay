import { describe, it, expect } from 'vitest';
import { Client } from '@modelcontextprotocol/sdk/client/index.js';
import { InMemoryTransport } from '@modelcontextprotocol/sdk/inMemory.js';
import { createMcpServer } from '../../../../src/interfaces/mcp/create-mcp-server.js';

describe('createMcpServer', () => {
  it('exposes relay_health tool via in-memory transport', async () => {
    const server = createMcpServer();
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
});
