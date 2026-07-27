import { describe, expect, it, vi } from 'vitest';
import type { TaskApplication } from '../../../../src/application/tasks/task-application.js';
import type { Task } from '../../../../src/domain/task/task.js';
import type { CliCommand } from '../../../../src/interfaces/cli/cli-command.js';
import { executeCliCommand } from '../../../../src/interfaces/cli/execute-cli-command.js';

function task(overrides: Partial<Task> = {}): Task {
  return {
    id: 'task-1',
    title: 'Prepare release',
    description: null,
    status: 'INBOX',
    priority: null,
    workspace: 'relay',
    sourceContext: null,
    createdByType: 'AGENT',
    createdByName: 'Codex',
    sessionId: 'session-a',
    createdAt: '2026-07-26T10:00:00.000Z',
    updatedAt: '2026-07-26T10:00:00.000Z',
    startedAt: null,
    completedAt: null,
    archivedAt: null,
    ...overrides,
  };
}

function application(overrides: Record<string, unknown> = {}): TaskApplication {
  return {
    create: vi.fn(() => task()),
    get: vi.fn(() => task()),
    list: vi.fn(() => [task()]),
    findSimilar: vi.fn(() => []),
    listSessionCaptures: vi.fn(() => [task()]),
    edit: vi.fn(() => ({ before: task(), task: task({ title: 'Updated' }) })),
    moveToInbox: vi.fn(() => ({ before: task(), task: task() })),
    activate: vi.fn(() => ({ before: task(), task: task({ status: 'ACTIVE' }) })),
    moveToBacklog: vi.fn(() => ({ before: task(), task: task({ status: 'BACKLOG' }) })),
    start: vi.fn(() => ({ before: task(), task: task({ status: 'IN_PROGRESS' }) })),
    complete: vi.fn(() => ({ before: task(), task: task({ status: 'DONE' }) })),
    archive: vi.fn(() => ({ before: task(), task: task({ status: 'ARCHIVED' }) })),
    ...overrides,
  } as unknown as TaskApplication;
}

describe('executeCliCommand', () => {
  it('looks for duplicates before creating an AGENT capture and returns warnings', () => {
    const findSimilar = vi.fn(() => [task({ id: 'existing' })]);
    const create = vi.fn(() => task({ id: 'created' }));
    const app = application({ findSimilar, create });

    const result = executeCliCommand(
      {
        kind: 'task.capture',
        title: 'Capture',
        agent: 'Codex',
        sessionId: 'session-a',
        workspace: 'relay',
      },
      app,
    );

    expect(findSimilar).toHaveBeenCalledWith({ title: 'Capture', workspace: 'relay', limit: 5 });
    expect(create).toHaveBeenCalledWith({
      title: 'Capture',
      workspace: 'relay',
      sessionId: 'session-a',
      creator: { type: 'AGENT', name: 'Codex' },
    });
    expect(result).toMatchObject({
      data: { task: { id: 'created' }, change: { action: 'CREATED' } },
      warnings: [{ code: 'POSSIBLE_DUPLICATE', candidates: [{ id: 'existing' }] }],
    });
  });

  it('maps reads to their exact application requests', () => {
    const app = application();
    executeCliCommand(
      { kind: 'task.list', statuses: ['INBOX', 'DONE'], workspace: 'relay', limit: 10 },
      app,
    );
    executeCliCommand({ kind: 'task.get', id: 'task-1' }, app);
    executeCliCommand(
      { kind: 'task.find-similar', title: 'Prepare release', workspace: 'relay', limit: 5 },
      app,
    );
    executeCliCommand({ kind: 'session.captures', sessionId: 'session-a', limit: 100 }, app);

    expect(app.list).toHaveBeenCalledWith({
      statuses: ['INBOX', 'DONE'],
      workspace: 'relay',
      limit: 10,
    });
    expect(app.get).toHaveBeenCalledWith({ id: 'task-1' });
    expect(app.findSimilar).toHaveBeenCalledWith({
      title: 'Prepare release',
      workspace: 'relay',
      limit: 5,
    });
    expect(app.listSessionCaptures).toHaveBeenCalledWith({ sessionId: 'session-a', limit: 100 });
  });

  it('maps edit, triage, and lifecycle commands to focused application calls', () => {
    const app = application();
    executeCliCommand({ kind: 'task.edit', id: 'task-1', changes: { description: null } }, app);
    executeCliCommand({ kind: 'task.triage', id: 'task-1', target: 'ACTIVE' }, app);
    executeCliCommand({ kind: 'task.start', id: 'task-1', action: 'start' }, app);
    executeCliCommand({ kind: 'task.complete', id: 'task-1', action: 'complete' }, app);
    executeCliCommand({ kind: 'task.archive', id: 'task-1', action: 'archive' }, app);

    expect(app.edit).toHaveBeenCalledWith({ id: 'task-1', description: null });
    expect(app.activate).toHaveBeenCalledWith({ id: 'task-1' });
    expect(app.start).toHaveBeenCalledWith({ id: 'task-1' });
    expect(app.complete).toHaveBeenCalledWith({ id: 'task-1' });
    expect(app.archive).toHaveBeenCalledWith({ id: 'task-1' });
  });

  it('returns exact change metadata for a no-op edit', () => {
    const unchanged = task();
    const app = application({ edit: vi.fn(() => ({ before: unchanged, task: unchanged })) });
    const result = executeCliCommand(
      { kind: 'task.edit', id: unchanged.id, changes: { title: unchanged.title } },
      app,
    );
    expect(result.data.change).toEqual({ action: 'NO_CHANGE', fields: [] });
  });

  it('accepts only validated command variants', () => {
    const command: CliCommand = { kind: 'task.get', id: 'task-1' };
    expect(executeCliCommand(command, application()).data).toHaveProperty('task');
  });
});
