import { describe, expect, it } from 'vitest';
import { createAgentTestRuntime } from '../support/agent-test-runtime.js';
import { runRelayCli } from '../support/cli-test-process.js';
import { createMcpTestClient } from '../support/mcp-test-client.js';
import {
  normalizeCliSuccess,
  normalizeMcpSuccess,
} from '../support/external-contract-normalizers.js';

describe('built agent workflow end to end', () => {
  it('isolates session review and includes open, completed, and archived captures', async () => {
    const runtime = await createAgentTestRuntime();
    const client = await createMcpTestClient(runtime);
    try {
      const capture = async (title: string, sessionId: string) =>
        normalizeMcpSuccess(
          await client.callTool('task_capture', {
            title,
            createdByName: 'Codex',
            sessionId,
            workspace: 'relay-verification',
          }),
        );
      const open = await capture('Alpha open capture', 'session-alpha');
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
      await client.callTool('task_triage', { taskId: completedId, target: 'ACTIVE' });
      await client.callTool('task_start', { taskId: completedId });
      await client.callTool('task_triage', { taskId: archivedId, target: 'ACTIVE' });
      await client.callTool('task_start', { taskId: archivedId });
      expect((await client.callTool('task_complete', { taskId: completedId }))).toMatchObject({
        structuredContent: { data: { task: { status: 'DONE' } } },
      });
      await client.callTool('task_complete', { taskId: archivedId });
      expect((await client.callTool('task_archive', { taskId: archivedId }))).toMatchObject({
        structuredContent: { data: { task: { status: 'ARCHIVED' } } },
      });

      const mcpReview = normalizeMcpSuccess(
        await client.callTool('session_captures_list', {
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
      expect(mcpReview.data).not.toMatchObject({ tasks: [expect.objectContaining({ sessionId: 'session-beta' })] });
    } finally {
      await client.close();
      await runtime.close();
    }
  });

  it('persists tasks and mutations across short-lived MCP and CLI restarts', async () => {
    const runtime = await createAgentTestRuntime();
    let client = await createMcpTestClient(runtime, {
      cwd: await runtime.createWorkingDirectory('restart/mcp-1'),
    });
    let taskId: string;
    try {
      const capture = normalizeMcpSuccess(
        await client.callTool('task_capture', {
          title: 'Restart persistence task',
          createdByName: 'Codex',
          sessionId: 'session-alpha',
        }),
      );
      taskId = String((capture.data as { task: { id: string } }).task.id);
    } finally {
      await client.close();
    }

    try {
      const get = await runRelayCli(
        runtime,
        ['task', 'get', taskId!, '--output', 'json'],
        { cwd: await runtime.createWorkingDirectory('restart/cli-1') },
      );
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
      client = await createMcpTestClient(runtime, {
        cwd: await runtime.createWorkingDirectory('restart/mcp-2'),
      });
      try {
        const get = normalizeMcpSuccess(await client.callTool('task_get', { taskId: taskId! }));
        expect(get.data).toMatchObject({
          task: { id: taskId!, description: 'survives restart', sessionId: 'session-alpha' },
        });
      } finally {
        await client.close();
        await runtime.close();
      }
    }
  });
});
