import { readdir, stat } from 'node:fs/promises';
import { basename, dirname, join } from 'node:path';
import { describe, expect, it } from 'vitest';
import { createTaskRuntime } from '../../src/interfaces/shared/create-task-runtime.js';
import {
  createHttpServer,
  type HttpServerInstance,
} from '../../src/interfaces/http/create-http-server.js';
import { createAgentTestRuntime, type AgentTestRuntime } from '../support/agent-test-runtime.js';
import { runRelayCli } from '../support/cli-test-process.js';
import { createMcpTestClient, type McpTestClient } from '../support/mcp-test-client.js';
import {
  normalizeCliSuccess,
  normalizeMcpSuccess,
} from '../support/external-contract-normalizers.js';

describe('shared database path across HTTP, MCP, and CLI', () => {
  it('uses one configured database from arbitrary CWDs and preserves data after all adapters restart', async () => {
    let runtime: AgentTestRuntime | undefined;
    let applicationRuntime: ReturnType<typeof createTaskRuntime> | undefined;
    let server: HttpServerInstance | undefined;
    let client: McpTestClient | undefined;
    try {
      runtime = await createAgentTestRuntime();
      applicationRuntime = createTaskRuntime({ databasePath: runtime.databasePath });
      server = await createHttpServer({
        host: '127.0.0.1',
        port: 0,
        taskApplication: applicationRuntime.taskApplication,
      });
      client = await createMcpTestClient(runtime, {
        cwd: await runtime.createWorkingDirectory('cwd/mcp'),
      });

      const capture = normalizeMcpSuccess(
        await client.callTool('task_capture', {
          title: 'Shared MCP task',
          createdByName: 'Codex',
          sessionId: 'session-alpha',
          workspace: 'relay-verification',
        }),
      );
      const capturedTask = (capture.data as { task: { id: string } }).task;
      const cliGet = await runRelayCli(
        runtime,
        ['task', 'get', capturedTask.id, '--output', 'json'],
        { cwd: await runtime.createWorkingDirectory('cwd/cli') },
      );
      expect(cliGet.exitCode).toBe(0);
      expect(normalizeCliSuccess(cliGet.json).data).toEqual({ task: capturedTask });

      const cliEdit = await runRelayCli(runtime, [
        'task',
        'edit',
        capturedTask.id,
        '--title',
        'Shared edited task',
        '--output',
        'json',
      ]);
      expect(cliEdit.exitCode).toBe(0);
      const httpEdited = await fetch(`${server.url}/api/tasks/${capturedTask.id}`);
      expect(httpEdited.status).toBe(200);
      await expect(httpEdited.json()).resolves.toMatchObject({
        task: { id: capturedTask.id, title: 'Shared edited task' },
      });

      const humanResponse = await fetch(`${server.url}/api/tasks`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ title: 'Shared human task' }),
      });
      expect(humanResponse.status).toBe(201);
      const humanTask = (await humanResponse.json()) as {
        task: { id: string; createdByType: string };
      };
      expect(humanTask.task.createdByType).toBe('HUMAN');

      const mcpHuman = normalizeMcpSuccess(
        await client.callTool('task_get', { taskId: humanTask.task.id }),
      );
      expect(mcpHuman.data).toMatchObject({
        task: { id: humanTask.task.id, createdByType: 'HUMAN' },
      });
      const cliList = await runRelayCli(runtime, ['task', 'list', '--output', 'json']);
      expect(cliList.exitCode).toBe(0);
      expect(normalizeCliSuccess(cliList.json).data).toMatchObject({
        tasks: expect.arrayContaining([
          expect.objectContaining({ id: capturedTask.id, title: 'Shared edited task' }),
          expect.objectContaining({ id: humanTask.task.id, title: 'Shared human task' }),
        ]),
        count: 2,
      });

      await client.close();
      client = undefined;
      await server.stop();
      server = undefined;
      applicationRuntime.close();
      applicationRuntime = undefined;

      applicationRuntime = createTaskRuntime({ databasePath: runtime.databasePath });
      server = await createHttpServer({
        host: '127.0.0.1',
        port: 0,
        taskApplication: applicationRuntime.taskApplication,
      });
      client = await createMcpTestClient(runtime, {
        cwd: await runtime.createWorkingDirectory('cwd/mcp-restart'),
      });
      const restartedHttp = await fetch(`${server.url}/api/tasks/${capturedTask.id}`);
      expect(restartedHttp.status).toBe(200);
      await expect(restartedHttp.json()).resolves.toMatchObject({
        task: { id: capturedTask.id, title: 'Shared edited task' },
      });
      const restartedMcp = normalizeMcpSuccess(
        await client.callTool('task_get', { taskId: humanTask.task.id }),
      );
      expect(restartedMcp.data).toMatchObject({
        task: { id: humanTask.task.id, title: 'Shared human task', createdByType: 'HUMAN' },
      });
    } finally {
      await client?.close();
      await server?.stop();
      applicationRuntime?.close();
      await runtime?.close();
    }
  });

  it('does not create a default or CWD-local database file', async () => {
    let runtime: AgentTestRuntime | undefined;
    let applicationRuntime: ReturnType<typeof createTaskRuntime> | undefined;
    let server: HttpServerInstance | undefined;
    let client: McpTestClient | undefined;
    try {
      runtime = await createAgentTestRuntime();
      applicationRuntime = createTaskRuntime({ databasePath: runtime.databasePath });
      server = await createHttpServer({
        host: '127.0.0.1',
        port: 0,
        taskApplication: applicationRuntime.taskApplication,
      });
      const mcpCwd = await runtime.createWorkingDirectory('mcp');
      const cliCwd = await runtime.createWorkingDirectory('cli');
      client = await createMcpTestClient(runtime, { cwd: mcpCwd });
      await client.callTool('task_capture', {
        title: 'Database location task',
        createdByName: 'Codex',
        sessionId: 'session-alpha',
      });
      const cli = await runRelayCli(runtime, ['task', 'list', '--output', 'json'], { cwd: cliCwd });
      expect(cli.exitCode).toBe(0);
      expect(await stat(runtime.databasePath)).toBeDefined();
      expect(await databaseFilesUnder(mcpCwd)).toEqual([]);
      expect(await databaseFilesUnder(cliCwd)).toEqual([]);
      expect(basename(dirname(runtime.databasePath))).toBe('data');
    } finally {
      await client?.close();
      await server?.stop();
      applicationRuntime?.close();
      await runtime?.close();
    }
  });
});

async function databaseFilesUnder(root: string): Promise<string[]> {
  const entries = await readdir(root, { withFileTypes: true });
  const files: string[] = [];
  for (const entry of entries) {
    const path = join(root, entry.name);
    if (entry.isDirectory()) files.push(...(await databaseFilesUnder(path)));
    else if (/\.db(?:-(?:wal|shm))?$|^relay\.db$/i.test(entry.name)) files.push(path);
  }
  return files;
}
