import { Client } from '@modelcontextprotocol/sdk/client/index.js';
import { StdioClientTransport } from '@modelcontextprotocol/sdk/client/stdio.js';
import { join } from 'node:path';
import type { AgentTestRuntime } from './agent-test-runtime.js';

export interface McpTestClient {
  listTools(): Promise<readonly { readonly name: string }[]>;
  callTool(name: string, args: Record<string, unknown>): Promise<unknown>;
  stderr(): string;
  close(): Promise<void>;
}

export interface McpTestClientOptions {
  readonly cwd?: string;
  readonly command?: string;
  readonly args?: readonly string[];
  readonly environment?: NodeJS.ProcessEnv;
}

export async function createMcpTestClient(
  runtime: AgentTestRuntime,
  options: McpTestClientOptions = {},
): Promise<McpTestClient> {
  const transport = new StdioClientTransport({
    command: options.command ?? process.execPath,
    args: [...(options.args ?? [join(runtime.checkoutPath, 'dist', 'mcp', 'main.js')])],
    cwd: options.cwd ?? runtime.checkoutPath,
    env: stringEnvironment(runtime.environment(options.environment)),
    stderr: 'pipe',
  });
  let serverStderr = '';
  transport.stderr?.on('data', (chunk: Buffer | string) => {
    serverStderr += chunk.toString();
  });

  const client = new Client({ name: 'relay-issue-25-test-client', version: '1.0.0' });
  try {
    await client.connect(transport);
  } catch (error) {
    await transport.close().catch(() => undefined);
    throw error;
  }

  let closed = false;
  return {
    async listTools() {
      const result = await client.listTools();
      return result.tools.map(({ name }) => ({ name }));
    },
    async callTool(name, args) {
      return client.callTool({ name, arguments: args });
    },
    stderr() {
      return serverStderr;
    },
    async close() {
      if (closed) return;
      closed = true;
      try {
        await client.close();
      } finally {
        await transport.close();
      }
    },
  };
}

function stringEnvironment(environment: NodeJS.ProcessEnv): Record<string, string> {
  return Object.fromEntries(
    Object.entries(environment).filter(
      (entry): entry is [string, string] => entry[1] !== undefined,
    ),
  );
}
