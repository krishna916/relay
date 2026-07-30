import { describe, expect, it } from 'vitest';
import type { McpTestClient } from '../../support/mcp-test-client.js';
import { createAgentTestRuntime } from '../../support/agent-test-runtime.js';
import { createMcpTestClient } from '../../support/mcp-test-client.js';

describe('createMcpTestClient', () => {
  it('discovers Relay tools while keeping server stdout protocol-owned', async () => {
    let runtime: Awaited<ReturnType<typeof createAgentTestRuntime>> | undefined;
    let client: McpTestClient | undefined;
    try {
      runtime = await createAgentTestRuntime();
      client = await createMcpTestClient(runtime, {
        cwd: await runtime.createWorkingDirectory('mcp/nested'),
      });
      const tools = await client.listTools();
      expect(tools.map((tool) => tool.name)).toEqual(
        expect.arrayContaining([
          'relay_health',
          'task_capture',
          'task_list',
          'task_get',
          'task_find_similar',
          'session_captures_list',
        ]),
      );
      expect(client.stderr()).not.toContain('Content-Length');
    } finally {
      await client?.close();
      await runtime?.close();
    }
  });

  it('surfaces unknown-tool protocol failures and still closes the child', async () => {
    let runtime: Awaited<ReturnType<typeof createAgentTestRuntime>> | undefined;
    let client: McpTestClient | undefined;
    try {
      runtime = await createAgentTestRuntime();
      client = await createMcpTestClient(runtime);
      await expect(client.callTool('unknown_tool', {})).resolves.toMatchObject({ isError: true });
      expect(client.stderr()).toBe('');
    } finally {
      await client?.close();
      await runtime?.close();
    }
  });
});
