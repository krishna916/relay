import { describe, expect, it, vi } from 'vitest';
import {
  createTaskApplication,
  type TaskApplication,
} from '../../src/application/tasks/task-application.js';
import type { Task } from '../../src/domain/task/task.js';
import { createMcpServer } from '../../src/interfaces/mcp/create-mcp-server.js';
import { runCli } from '../../src/interfaces/cli/run-cli.js';
import type { TaskRuntime } from '../../src/interfaces/shared/create-task-runtime.js';
import {
  FixedClock,
  FixedIdGenerator,
  InMemoryTaskRepository,
} from '../unit/application/tasks/task-test-fixtures.js';
import { connectMcp } from '../unit/interfaces/mcp/mcp-test-utils.js';

const FIXED_NOW = new Date('2026-07-27T10:00:00.000Z');

function createApplication(): TaskApplication {
  return createTaskApplication({
    repository: new InMemoryTaskRepository(),
    clock: new FixedClock(FIXED_NOW),
    idGenerator: new FixedIdGenerator('task-1'),
  });
}

function seedApplication(): { application: TaskApplication; task: Task } {
  const application = createApplication();
  const task = application.create({
    title: 'Prepare release',
    description: 'Details',
    priority: 'LOW',
    workspace: 'relay',
    sourceContext: 'issue-22',
    sessionId: 'session-a',
    creator: { type: 'AGENT', name: 'Codex' },
  });
  return { application, task };
}

async function callMcp(
  application: TaskApplication,
  name: string,
  arguments_: Record<string, unknown>,
): Promise<{ data?: unknown; error?: unknown }> {
  const { client, close } = await connectMcp(createMcpServer(application));
  try {
    const result = (await client.callTool({ name, arguments: arguments_ })) as {
      structuredContent?: { data?: unknown; error?: unknown };
    };
    return result.structuredContent ?? {};
  } finally {
    await close();
  }
}

async function callCli(application: TaskApplication, argv: readonly string[]) {
  const stdout = { write: vi.fn() };
  const stderr = { write: vi.fn() };
  const runtime: TaskRuntime = { taskApplication: application, close: vi.fn() };
  const exitCode = await runCli(argv, { createRuntime: () => runtime, stdout, stderr });
  const envelope = JSON.parse(stdout.write.mock.calls[0]?.[0] as string) as {
    data?: unknown;
    error?: unknown;
  };
  return { exitCode, data: envelope.data, error: envelope.error, stderr };
}

describe('MCP and CLI semantic parity', () => {
  it('matches capture payloads and duplicate warnings', async () => {
    const cli = await callCli(createApplication(), [
      'task',
      'capture',
      '--title',
      'Prepare release',
      '--agent',
      'Codex',
      '--session',
      'session-a',
      '--workspace',
      'relay',
      '--output',
      'json',
    ]);
    const mcp = await callMcp(createApplication(), 'task_capture', {
      title: 'Prepare release',
      createdByName: 'Codex',
      sessionId: 'session-a',
      workspace: 'relay',
    });
    expect(cli.exitCode).toBe(0);
    expect(cli.data).toEqual(mcp.data);
    expect(cli.data).toMatchObject({ change: { action: 'CREATED' }, task: { id: 'task-1' } });
    expect(cli.data).toHaveProperty('task');
  });

  it.each([
    [
      'list',
      ['task', 'list', '--status', 'INBOX', '--workspace', 'relay', '--output', 'json'],
      'task_list',
      { statuses: ['INBOX'], workspace: 'relay' },
    ],
    ['get', ['task', 'get', 'task-1', '--output', 'json'], 'task_get', { taskId: 'task-1' }],
    [
      'find similar',
      [
        'task',
        'find-similar',
        '--title',
        'Prepare release',
        '--workspace',
        'relay',
        '--output',
        'json',
      ],
      'task_find_similar',
      { title: 'Prepare release', workspace: 'relay' },
    ],
    [
      'session captures',
      ['session', 'captures', '--session', 'session-a', '--output', 'json'],
      'session_captures_list',
      { sessionId: 'session-a' },
    ],
  ] as const)('matches %s read payloads', async (_name, cliArgs, mcpName, mcpArgs) => {
    const cliApp = seedApplication().application;
    const mcpApp = seedApplication().application;
    const cli = await callCli(cliApp, cliArgs);
    const mcp = await callMcp(mcpApp, mcpName, mcpArgs);
    expect(cli.exitCode).toBe(0);
    expect(cli.data).toEqual(mcp.data);
  });

  it.each([
    [
      'edit',
      ['task', 'edit', 'task-1', '--title', 'Updated', '--output', 'json'],
      'task_edit',
      { taskId: 'task-1', title: 'Updated' },
    ],
    [
      'clear',
      ['task', 'edit', 'task-1', '--clear-description', '--output', 'json'],
      'task_edit',
      { taskId: 'task-1', clearDescription: true },
    ],
    [
      'no-op',
      ['task', 'edit', 'task-1', '--title', 'Prepare release', '--output', 'json'],
      'task_edit',
      { taskId: 'task-1', title: 'Prepare release' },
    ],
  ] as const)('matches %s edit payloads', async (_name, cliArgs, mcpName, mcpArgs) => {
    const cli = await callCli(seedApplication().application, cliArgs);
    const mcp = await callMcp(seedApplication().application, mcpName, mcpArgs);
    expect(cli.exitCode).toBe(0);
    expect(cli.data).toEqual(mcp.data);
  });

  it.each(['INBOX', 'ACTIVE', 'BACKLOG'] as const)(
    'matches triage payload for %s',
    async (target) => {
      const cli = await callCli(seedApplication().application, [
        'task',
        'triage',
        'task-1',
        '--to',
        target,
        '--output',
        'json',
      ]);
      const mcp = await callMcp(seedApplication().application, 'task_triage', {
        taskId: 'task-1',
        target,
      });
      expect(cli.exitCode).toBe(0);
      expect(cli.data).toEqual(mcp.data);
    },
  );

  it.each([
    ['start', 'task_start', 'start'],
    ['complete', 'task_complete', 'complete'],
    ['archive', 'task_archive', 'archive'],
  ] as const)('matches %s lifecycle payloads', async (_name, mcpName, action) => {
    const cliFixture = seedApplication();
    const mcpFixture = seedApplication();
    cliFixture.application.activate({ id: 'task-1' });
    mcpFixture.application.activate({ id: 'task-1' });
    if (action !== 'start') {
      cliFixture.application.start({ id: 'task-1' });
      mcpFixture.application.start({ id: 'task-1' });
      if (action === 'archive') {
        cliFixture.application.complete({ id: 'task-1' });
        mcpFixture.application.complete({ id: 'task-1' });
      }
    }
    const cli = await callCli(cliFixture.application, [
      'task',
      action,
      'task-1',
      '--output',
      'json',
    ]);
    const mcp = await callMcp(mcpFixture.application, mcpName, { taskId: 'task-1' });
    expect(cli.exitCode).toBe(0);
    expect(cli.data).toEqual(mcp.data);
  });

  it('matches not-found and conflict error semantics', async () => {
    const cliNotFound = await callCli(createApplication(), [
      'task',
      'get',
      'missing',
      '--output',
      'json',
    ]);
    const mcpNotFound = await callMcp(createApplication(), 'task_get', { taskId: 'missing' });
    expect(cliNotFound.exitCode).toBe(3);
    expect(cliNotFound.error).toEqual(mcpNotFound.error);

    const cliConflict = await callCli(seedApplication().application, [
      'task',
      'start',
      'task-1',
      '--output',
      'json',
    ]);
    const mcpConflict = await callMcp(seedApplication().application, 'task_start', {
      taskId: 'task-1',
    });
    expect(cliConflict.exitCode).toBe(4);
    expect(cliConflict.error).toEqual(mcpConflict.error);
  });
});
