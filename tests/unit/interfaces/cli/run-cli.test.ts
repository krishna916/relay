import { describe, expect, it, vi } from 'vitest';
import type { TaskApplication } from '../../../../src/application/tasks/task-application.js';
import type { TaskRuntime } from '../../../../src/interfaces/shared/create-task-runtime.js';
import { runCli } from '../../../../src/interfaces/cli/run-cli.js';

describe('runCli', () => {
  it('writes one JSON result and closes the shared runtime once', async () => {
    const stdout = { write: vi.fn() };
    const stderr = { write: vi.fn() };
    const runtime: TaskRuntime = {
      taskApplication: {
        get: vi.fn(() => ({ id: 'task-1', title: 'Task' })),
      } as unknown as TaskApplication,
      close: vi.fn(),
    };

    await expect(
      runCli(['task', 'get', 'task-1', '--output', 'json'], {
        createRuntime: vi.fn(() => runtime),
        stdout,
        stderr,
      }),
    ).resolves.toBe(0);

    expect(stdout.write).toHaveBeenCalledOnce();
    expect(JSON.parse(stdout.write.mock.calls[0]?.[0] as string)).toMatchObject({
      schemaVersion: 1,
      ok: true,
      data: { task: { id: 'task-1' } },
      warnings: [],
    });
    expect(stderr.write).not.toHaveBeenCalled();
    expect(runtime.close).toHaveBeenCalledOnce();
  });

  it('reports syntax failures without starting a runtime', async () => {
    const createRuntime = vi.fn();
    const stdout = { write: vi.fn() };
    const stderr = { write: vi.fn() };

    await expect(runCli(['task', 'get'], { createRuntime, stdout, stderr })).resolves.toBe(2);

    expect(createRuntime).not.toHaveBeenCalled();
    expect(stdout.write).toHaveBeenCalledOnce();
    expect(JSON.parse(stdout.write.mock.calls[0]?.[0] as string)).toMatchObject({
      schemaVersion: 1,
      ok: false,
      error: { code: 'VALIDATION_ERROR' },
    });
    expect(stderr.write).toHaveBeenCalledOnce();
  });

  it('puts capture duplicate warnings in the envelope warning array', async () => {
    const stdout = { write: vi.fn() };
    const runtime: TaskRuntime = {
      taskApplication: {
        findSimilar: vi.fn(() => [{ id: 'existing' }]),
        create: vi.fn(() => ({ id: 'created', title: 'Task' })),
      } as unknown as TaskApplication,
      close: vi.fn(),
    };
    await runCli(
      [
        'task',
        'capture',
        '--title',
        'Task',
        '--agent',
        'codex',
        '--session',
        'session-1',
        '--output',
        'json',
      ],
      { createRuntime: () => runtime, stdout, stderr: { write: vi.fn() } },
    );
    expect(JSON.parse(stdout.write.mock.calls[0]?.[0] as string).warnings).toEqual([
      {
        code: 'POSSIBLE_DUPLICATE',
        message: 'Similar tasks already exist.',
        candidates: [{ id: 'existing' }],
      },
    ]);
  });
});
