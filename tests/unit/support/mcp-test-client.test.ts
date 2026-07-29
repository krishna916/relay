import { describe, expect, it } from 'vitest';
import { createAgentTestRuntime } from '../../support/agent-test-runtime.js';
import { createMcpTestClient } from '../../support/mcp-test-client.js';

describe('createMcpTestClient', () => {
  it('discovers Relay tools while keeping server stdout protocol-owned', async () => {
    const runtime = await createAgentTestRuntime();
    const client = await createMcpTestClient(runtime, {
      cwd: await runtime.createWorkingDirectory('mcp/nested'),
    });
    try {
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
      await client.close();
      await runtime.close();
    }
  });

  it('surfaces unknown-tool protocol failures and still closes the child', async () => {
    const runtime = await createAgentTestRuntime();
    const client = await createMcpTestClient(runtime);
    try {
      await expect(client.callTool('unknown_tool', {})).resolves.toMatchObject({ isError: true });
      expect(client.stderr()).not.toMatch(/SQL|stack|RELAY_DB_PATH|[A-Z]:\\Users\\/i);
    } finally {
      await client.close();
      await runtime.close();
    }
  });
});
