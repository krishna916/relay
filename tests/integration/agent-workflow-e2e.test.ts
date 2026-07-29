import { describe, expect, it } from 'vitest';
import { readFile, rm, stat, writeFile } from 'node:fs/promises';
import { join } from 'node:path';
import type { McpTestClient } from '../support/mcp-test-client.js';
import type { AgentTestRuntime } from '../support/agent-test-runtime.js';
import { createAgentTestRuntime } from '../support/agent-test-runtime.js';
import { runRelayCli } from '../support/cli-test-process.js';
import { createMcpTestClient } from '../support/mcp-test-client.js';
import {
  normalizeCliSuccess,
  normalizeMcpSuccess,
} from '../support/external-contract-normalizers.js';

describe('built agent workflow end to end', () => {
  it('isolates session review and includes open, completed, and archived captures', async () => {
    let runtime: AgentTestRuntime | undefined;
    let client: McpTestClient | undefined;
    try {
      runtime = await createAgentTestRuntime();
      const connectedClient = await createMcpTestClient(runtime);
      client = connectedClient;
      const capture = async (title: string, sessionId: string) =>
        normalizeMcpSuccess(
          await connectedClient.callTool('task_capture', {
            title,
            createdByName: 'Codex',
            sessionId,
            workspace: 'relay-verification',
          }),
        );
      await capture('Alpha open capture', 'session-alpha');
      const completed = await capture('Alpha completed capture', 'session-alpha');
      const archived = await capture('Alpha archived capture', 'session-alpha');
      const beta = await runRelayCli(runtime, [
        'task',
        'capture',
        '--title',
        'Beta open capture',
        '--agent',
        'Claude Code',
        '--session',
        'session-beta',
        '--output',
        'json',
      ]);
      expect(beta.exitCode).toBe(0);

      const completedId = String((completed.data as { task: { id: string } }).task.id);
      const archivedId = String((archived.data as { task: { id: string } }).task.id);
      await connectedClient.callTool('task_triage', { taskId: completedId, target: 'ACTIVE' });
      await connectedClient.callTool('task_start', { taskId: completedId });
      await connectedClient.callTool('task_triage', { taskId: archivedId, target: 'ACTIVE' });
      await connectedClient.callTool('task_start', { taskId: archivedId });
      expect(
        await connectedClient.callTool('task_complete', { taskId: completedId }),
      ).toMatchObject({
        structuredContent: { data: { task: { status: 'DONE' } } },
      });
      await connectedClient.callTool('task_complete', { taskId: archivedId });
      expect(await connectedClient.callTool('task_archive', { taskId: archivedId })).toMatchObject({
        structuredContent: { data: { task: { status: 'ARCHIVED' } } },
      });

      const mcpReview = normalizeMcpSuccess(
        await connectedClient.callTool('session_captures_list', {
          sessionId: 'session-alpha',
          limit: 100,
        }),
      );
      const cliReview = await runRelayCli(runtime, [
        'session',
        'captures',
        '--session',
        'session-alpha',
        '--output',
        'json',
      ]);
      expect(cliReview.exitCode).toBe(0);
      expect(normalizeCliSuccess(cliReview.json)).toEqual(mcpReview);
      expect(mcpReview.data).toMatchObject({
        sessionId: 'session-alpha',
        count: 3,
        tasks: [
          { title: 'Alpha open capture', status: 'INBOX' },
          { title: 'Alpha completed capture', status: 'DONE' },
          { title: 'Alpha archived capture', status: 'ARCHIVED' },
        ],
      });
      expect(mcpReview.data).not.toMatchObject({
        tasks: [expect.objectContaining({ sessionId: 'session-beta' })],
      });
    } finally {
      await client?.close();
      await runtime?.close();
    }
  });

  it('persists tasks and mutations across short-lived MCP and CLI restarts', async () => {
    let runtime: AgentTestRuntime | undefined;
    let client: McpTestClient | undefined;
    let taskId: string;
    try {
      runtime = await createAgentTestRuntime();
      client = await createMcpTestClient(runtime, {
        cwd: await runtime.createWorkingDirectory('restart/mcp-1'),
      });
      const capture = normalizeMcpSuccess(
        await client!.callTool('task_capture', {
          title: 'Restart persistence task',
          createdByName: 'Codex',
          sessionId: 'session-alpha',
        }),
      );
      taskId = String((capture.data as { task: { id: string } }).task.id);
    } finally {
      await client?.close();
    }

    try {
      const get = await runRelayCli(runtime, ['task', 'get', taskId!, '--output', 'json'], {
        cwd: await runtime.createWorkingDirectory('restart/cli-1'),
      });
      expect(get.exitCode).toBe(0);
      const edit = await runRelayCli(runtime, [
        'task',
        'edit',
        taskId!,
        '--description',
        'survives restart',
        '--output',
        'json',
      ]);
      expect(edit.exitCode).toBe(0);
    } finally {
      client = await createMcpTestClient(runtime!, {
        cwd: await runtime.createWorkingDirectory('restart/mcp-2'),
      });
      try {
        const get = normalizeMcpSuccess(await client.callTool('task_get', { taskId: taskId! }));
        expect(get.data).toMatchObject({
          task: { id: taskId!, description: 'survives restart', sessionId: 'session-alpha' },
        });
      } finally {
        await client.close();
        await runtime!.close();
      }
    }
  });

  it('preserves stored data when a disposable integration configuration is removed', async () => {
    let runtime: AgentTestRuntime | undefined;
    let client: McpTestClient | undefined;
    try {
      runtime = await createAgentTestRuntime();
      const configDirectory = await runtime.createWorkingDirectory('integration-config');
      const configPath = join(configDirectory, '.mcp.json');
      const config = {
        mcpServers: {
          relay: {
            command: process.execPath,
            args: [join(runtime.checkoutPath, 'dist', 'mcp', 'main.js')],
          },
        },
      };
      await writeFile(configPath, JSON.stringify(config));
      const loadedConfig = JSON.parse(await readFile(configPath, 'utf8')) as typeof config;
      const server = loadedConfig.mcpServers.relay;
      client = await createMcpTestClient(runtime, {
        cwd: configDirectory,
        command: server.command,
        args: server.args,
      });
      const capture = normalizeMcpSuccess(
        await client.callTool('task_capture', {
          title: 'Configuration removal preserves data',
          createdByName: 'Codex',
          sessionId: 'session-alpha',
        }),
      );
      const taskId = String((capture.data as { task: { id: string } }).task.id);
      await client.close();
      client = undefined;
      await rm(configPath);
      await expect(stat(configPath)).rejects.toMatchObject({ code: 'ENOENT' });

      client = await createMcpTestClient(runtime, { cwd: configDirectory });
      const retrieved = normalizeMcpSuccess(await client.callTool('task_get', { taskId }));
      expect(retrieved.data).toMatchObject({
        task: { id: taskId, title: 'Configuration removal preserves data' },
      });
    } finally {
      await client?.close();
      await runtime?.close();
    }
  });
});
