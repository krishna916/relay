import { describe, expect, it, vi } from 'vitest';
import {
  InvalidTaskRequestError,
  TaskNotFoundError,
  TaskPersistenceError,
} from '../../../../src/application/tasks/task-application-errors.js';
import { TaskArchivedError, TaskTransitionError } from '../../../../src/domain/task/task-errors.js';
import type { TaskApplication } from '../../../../src/application/tasks/task-application.js';
import type { TaskRuntime } from '../../../../src/interfaces/shared/create-task-runtime.js';
import { runCli } from '../../../../src/interfaces/cli/run-cli.js';

describe('CLI error envelopes and exit codes', () => {
  it.each([
    ['invalid request', new InvalidTaskRequestError('private validation'), 2, 'VALIDATION_ERROR'],
    ['not found', new TaskNotFoundError('private id'), 3, 'NOT_FOUND'],
    ['archived', new TaskArchivedError('private archive'), 4, 'ARCHIVED_TASK'],
    ['conflict', new TaskTransitionError('private transition'), 4, 'CONFLICT'],
    ['storage', new TaskPersistenceError('private storage'), 5, 'STORAGE_ERROR'],
    ['unexpected', new Error('private implementation'), 1, 'INTERNAL_ERROR'],
  ] as const)('maps %s without leaking internals', async (_name, error, exitCode, code) => {
    const stdout = { write: vi.fn() };
    const stderr = { write: vi.fn() };
    const runtime: TaskRuntime = {
      taskApplication: {
        get: vi.fn(() => {
          throw error;
        }),
      } as unknown as TaskApplication,
      close: vi.fn(),
    };

    await expect(
      runCli(['task', 'get', 'task-1', '--output', 'json'], {
        createRuntime: () => runtime,
        stdout,
        stderr,
      }),
    ).resolves.toBe(exitCode);

    expect(stdout.write).toHaveBeenCalledOnce();
    expect(stderr.write).toHaveBeenCalledOnce();
    expect(stdout.write.mock.calls[0]?.[0]).not.toContain('private');
    expect(stderr.write.mock.calls[0]?.[0]).not.toContain('private');
    expect(JSON.parse(stdout.write.mock.calls[0]?.[0] as string)).toMatchObject({
      ok: false,
      error: { code },
    });
    expect(runtime.close).toHaveBeenCalledOnce();
  });
});
