import { Client } from '@modelcontextprotocol/sdk/client/index.js';
import { InMemoryTransport } from '@modelcontextprotocol/sdk/inMemory.js';
import type { createMcpServer } from '../../../../src/interfaces/mcp/create-mcp-server.js';

export async function connectMcp(server: ReturnType<typeof createMcpServer>) {
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
