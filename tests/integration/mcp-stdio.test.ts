import { mkdtempSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { beforeAll, describe, expect, it } from 'vitest';
import { Client } from '@modelcontextprotocol/sdk/client/index.js';
import { StdioClientTransport } from '@modelcontextprotocol/sdk/client/stdio.js';
import { execSync } from 'node:child_process';
import { rmSync } from 'node:fs';

describe('mcp-stdio integration', () => {
  beforeAll(() => {
    execSync('pnpm build:node', { stdio: 'inherit' });
  });

  it('preserves discovery, sessions, duplicates, and protocol operation in the built stdio process', async () => {
    const builtJsPath = join(process.cwd(), 'dist', 'mcp', 'main.js');
    const launchDir = mkdtempSync(join(tmpdir(), 'relay-mcp-launch-'));

    const databasePath = join(launchDir, 'relay.db');
    const transport = new StdioClientTransport({
      command: 'node',
      args: [builtJsPath],
      cwd: launchDir,
      env: { ...process.env, RELAY_DB_PATH: databasePath },
    });

    const client = new Client({ name: 'integration-tester', version: '1.0.0' });

    try {
      await client.connect(transport);

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

      const res = (await client.callTool({ name: 'relay_health', arguments: {} })) as {
        content: Array<{ type: string; text: string }>;
      };
      expect(res.content[0]?.type).toBe('text');
      if (res.content[0]?.type === 'text') {
        expect(JSON.parse(res.content[0].text)).toEqual({
          name: 'relay',
          status: 'ok',
          version: '0.1.0',
        });
      }

      const capture = async (title: string, sessionId: string) =>
        (await client.callTool({
          name: 'task_capture',
          arguments: { title, createdByName: 'Integration tester', sessionId },
        })) as {
          structuredContent?: {
            data?: { task?: { id?: string; sessionId?: string; createdByType?: string } };
            warnings?: Array<{ code: string }>;
          };
        };
      const first = await capture('Persist MCP capture', 'stdio-session-a');
      const second = await capture('Persist MCP capture', 'stdio-session-a');
      const otherSession = await capture('Session B capture', 'stdio-session-b');
      expect(first.structuredContent?.data?.task).toMatchObject({
        sessionId: 'stdio-session-a',
        createdByType: 'AGENT',
      });
      expect(second.structuredContent?.warnings).toEqual(
        expect.arrayContaining([expect.objectContaining({ code: 'POSSIBLE_DUPLICATE' })]),
      );
      expect(otherSession.structuredContent?.data?.task?.sessionId).toBe('stdio-session-b');

      const sessionA = (await client.callTool({
        name: 'session_captures_list',
        arguments: { sessionId: 'stdio-session-a' },
      })) as { structuredContent?: { data?: { tasks?: Array<{ id: string }>; count?: number } } };
      const sessionB = (await client.callTool({
        name: 'session_captures_list',
        arguments: { sessionId: 'stdio-session-b' },
      })) as { structuredContent?: { data?: { tasks?: Array<{ id: string }>; count?: number } } };
      expect(sessionA.structuredContent?.data?.count).toBe(2);
      expect(sessionA.structuredContent?.data?.tasks?.map((task) => task.id)).toEqual([
        first.structuredContent?.data?.task?.id,
        second.structuredContent?.data?.task?.id,
      ]);
      expect(sessionB.structuredContent?.data?.count).toBe(1);

      const invalid = await client.callTool({
        name: 'task_capture',
        arguments: {
          title: 'Invalid',
          createdByName: 'Integration tester',
          sessionId: 'bad session',
        },
      });
      expect(invalid).toMatchObject({ isError: true });
      const healthyAfterInvalid = await client.callTool({ name: 'relay_health', arguments: {} });
      expect(healthyAfterInvalid).not.toHaveProperty('isError');
    } finally {
      await transport.close();
      rmSync(launchDir, { recursive: true, force: true });
    }
  });
});
