import { mkdtempSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { beforeAll, describe, expect, it } from 'vitest';
import { Client } from '@modelcontextprotocol/sdk/client/index.js';
import { StdioClientTransport } from '@modelcontextprotocol/sdk/client/stdio.js';
import { execSync } from 'node:child_process';

describe('mcp-stdio integration', () => {
  beforeAll(() => {
    execSync('pnpm.cmd build:node', { stdio: 'inherit' });
  });

  it('spawns built MCP stdio process and calls relay_health tool cleanly', async () => {
    const builtJsPath = join(process.cwd(), 'dist', 'mcp', 'main.js');
    const launchDir = mkdtempSync(join(tmpdir(), 'relay-mcp-launch-'));

    const transport = new StdioClientTransport({
      command: 'node',
      args: [builtJsPath],
      cwd: launchDir,
    });

    const client = new Client({ name: 'integration-tester', version: '1.0.0' });

    await client.connect(transport);

    const tools = await client.listTools();
    expect(tools.tools.some((t) => t.name === 'relay_health')).toBe(true);

    const res = (await client.callTool({ name: 'relay_health', arguments: {} })) as {
      content: Array<{ type: string; text: string }>;
    };
    expect(res.content[0]?.type).toBe('text');
    if (res.content[0]?.type === 'text') {
      const payload = JSON.parse(res.content[0].text) as {
        name: string;
        status: string;
        version: string;
      };
      expect(payload).toEqual({ name: 'relay', status: 'ok', version: '0.1.0' });
    }

    await transport.close();
  });
});
