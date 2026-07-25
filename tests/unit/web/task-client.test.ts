import { afterEach, describe, expect, it, vi } from 'vitest';
import {
  activateTask,
  archiveTask,
  completeTask,
  createTask,
  editTask,
  getTask,
  listTasks,
  moveTaskToBacklog,
  moveTaskToInbox,
  RelayApiError,
  startTask,
} from '../../../web/src/api/task-client.js';

const task = {
  id: 'task / 1',
  title: 'Ship the UI',
  description: 'Use the local API.',
  status: 'ACTIVE',
  priority: 'HIGH',
  workspace: 'relay',
  sourceContext: 'issue-9',
  createdByType: 'HUMAN',
  createdByName: null,
  createdAt: '2026-07-25T10:00:00.000Z',
  updatedAt: '2026-07-25T10:01:00.000Z',
  startedAt: null,
  completedAt: null,
  archivedAt: null,
} as const;

function response(ok: boolean, status: number, body: unknown): Response {
  return {
    ok,
    status,
    json: vi.fn().mockResolvedValue(body),
  } as unknown as Response;
}

afterEach(() => {
  vi.unstubAllGlobals();
});

describe('task-client', () => {
  it('parses valid task and list responses', async () => {
    const fetchSpy = vi
      .fn()
      .mockResolvedValueOnce(response(true, 201, { task }))
      .mockResolvedValueOnce(response(true, 200, { tasks: [task] }));
    vi.stubGlobal('fetch', fetchSpy);

    await expect(createTask({ title: 'Ship the UI' })).resolves.toEqual(task);
    await expect(listTasks('active')).resolves.toEqual([task]);

    expect(fetchSpy).toHaveBeenNthCalledWith(
      1,
      '/api/tasks',
      expect.objectContaining({
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ title: 'Ship the UI' }),
      }),
    );
    expect(fetchSpy).toHaveBeenNthCalledWith(2, '/api/tasks?view=active', {});
  });

  it('uses completed limit and encodes a task ID as one path segment', async () => {
    const fetchSpy = vi
      .fn()
      .mockResolvedValueOnce(response(true, 200, { tasks: [] }))
      .mockResolvedValueOnce(response(true, 200, { task }));
    vi.stubGlobal('fetch', fetchSpy);

    await listTasks('completed', 50);
    await getTask(task.id);

    expect(fetchSpy).toHaveBeenNthCalledWith(1, '/api/tasks?view=completed&limit=50', {});
    expect(fetchSpy).toHaveBeenNthCalledWith(2, '/api/tasks/task%20%2F%201', {});
  });

  it('sends the correct method, path, and body for edits and lifecycle actions', async () => {
    const fetchSpy = vi.fn().mockResolvedValue(response(true, 200, { task }));
    vi.stubGlobal('fetch', fetchSpy);

    await editTask(task.id, { title: 'Updated', priority: null });
    await moveTaskToInbox(task.id);
    await activateTask(task.id);
    await startTask(task.id);
    await moveTaskToBacklog(task.id);
    await completeTask(task.id);
    await archiveTask(task.id);

    expect(fetchSpy).toHaveBeenNthCalledWith(
      1,
      '/api/tasks/task%20%2F%201',
      expect.objectContaining({
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ title: 'Updated', priority: null }),
      }),
    );
    expect(fetchSpy.mock.calls.slice(1).map(([url, init]) => [url, init?.method])).toEqual([
      ['/api/tasks/task%20%2F%201/move-to-inbox', 'POST'],
      ['/api/tasks/task%20%2F%201/activate', 'POST'],
      ['/api/tasks/task%20%2F%201/start', 'POST'],
      ['/api/tasks/task%20%2F%201/move-to-backlog', 'POST'],
      ['/api/tasks/task%20%2F%201/complete', 'POST'],
      ['/api/tasks/task%20%2F%201/archive', 'POST'],
    ]);
    for (const [, init] of fetchSpy.mock.calls.slice(1)) {
      expect(init?.headers).toBeUndefined();
      expect(init?.body).toBeUndefined();
    }
  });

  it.each([400, 404, 409, 500])('surfaces a structured %i server error', async (status) => {
    vi.stubGlobal(
      'fetch',
      vi.fn().mockResolvedValue(
        response(false, status, {
          error: {
            code: 'TASK_CONFLICT',
            message: 'The task changed elsewhere.',
            details: { title: ['Title is required'] },
          },
        }),
      ),
    );

    await expect(createTask({ title: 'Ship the UI' })).rejects.toMatchObject({
      name: 'RelayApiError',
      status,
      code: 'TASK_CONFLICT',
      message: 'The task changed elsewhere.',
      details: { title: ['Title is required'] },
    } satisfies Partial<RelayApiError>);
  });

  it('rejects malformed success and error payloads with a safe API error', async () => {
    const fetchSpy = vi
      .fn()
      .mockResolvedValueOnce(response(true, 200, { task: { id: 123 } }))
      .mockResolvedValueOnce(response(false, 500, { unexpected: 'body' }));
    vi.stubGlobal('fetch', fetchSpy);

    await expect(getTask('task-1')).rejects.toMatchObject({
      code: 'INVALID_SERVER_RESPONSE',
      message: 'Relay returned an invalid response.',
    });
    await expect(getTask('task-1')).rejects.toMatchObject({
      code: 'INVALID_SERVER_RESPONSE',
      message: 'Relay returned an invalid error response.',
    });
  });

  it('preserves an AbortError from fetch', async () => {
    const abortError = Object.assign(new Error('Aborted'), { name: 'AbortError' });
    vi.stubGlobal('fetch', vi.fn().mockRejectedValue(abortError));

    await expect(listTasks('active')).rejects.toBe(abortError);
  });
});
