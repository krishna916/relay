import { afterEach, describe, expect, it, vi } from 'vitest';
import {
  createTaskApplication,
  type TaskApplication,
} from '../../src/application/tasks/task-application.js';
import {
  createHttpServer,
  type HttpServerInstance,
} from '../../src/interfaces/http/create-http-server.js';
import {
  createTemporaryDatabase,
  createMigratedTemporaryDatabase,
  type TemporaryDatabaseContext,
} from '../support/temporary-database.js';
import { SqliteTaskRepository } from '../../src/database/tasks/sqlite-task-repository.js';
import { createTaskRuntime } from '../../src/interfaces/http/create-task-runtime.js';
import { TaskPersistenceError } from '../../src/application/tasks/task-application-errors.js';

describe('http tasks integration', () => {
  let database: TemporaryDatabaseContext | null = null;
  let server: HttpServerInstance | null = null;

  afterEach(async () => {
    if (server) {
      await server.stop();
      server = null;
    }
    database?.cleanup();
    database = null;
  });

  it('creates a minimal human task with a location and complete DTO', async () => {
    const taskApplication = createTestApplication();
    server = await createHttpServer({ host: '127.0.0.1', port: 0, taskApplication });

    const response = await fetch(`${server.url}/api/tasks`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ title: 'Prepare HTTP adapter' }),
    });

    expect(response.status).toBe(201);
    expect(response.headers.get('location')).toMatch(/^\/api\/tasks\//);
    expect(response.headers.get('content-type')).toBe('application/json; charset=utf-8');
    await expect(response.json()).resolves.toMatchObject({
      task: {
        title: 'Prepare HTTP adapter',
        status: 'INBOX',
        createdByType: 'HUMAN',
        createdByName: null,
        sessionId: null,
        description: null,
        priority: null,
        workspace: null,
        sourceContext: null,
        startedAt: null,
        completedAt: null,
        archivedAt: null,
      },
    });
  });

  it('lists active tasks by default and maps explicit lifecycle actions', async () => {
    const taskApplication = createTestApplication();
    server = await createHttpServer({ host: '127.0.0.1', port: 0, taskApplication });
    const created = await createTask(server.url, 'Lifecycle task');

    await expect(action(server.url, created.id, 'activate')).resolves.toMatchObject({
      status: 'ACTIVE',
    });
    await expect(action(server.url, created.id, 'start')).resolves.toMatchObject({
      status: 'IN_PROGRESS',
      startedAt: expect.any(String),
    });

    const response = await fetch(`${server.url}/api/tasks`);
    expect(response.status).toBe(200);
    await expect(response.json()).resolves.toMatchObject({
      tasks: [expect.objectContaining({ id: created.id, status: 'IN_PROGRESS' })],
    });
  });

  it('edits metadata but rejects a generic status patch', async () => {
    server = await createHttpServer({
      host: '127.0.0.1',
      port: 0,
      taskApplication: createTestApplication(),
    });
    const created = await createTask(server.url, 'Before edit');

    const edit = await fetch(`${server.url}/api/tasks/${created.id}`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ title: 'After edit', description: null, priority: 'HIGH' }),
    });
    expect(edit.status).toBe(200);
    await expect(edit.json()).resolves.toMatchObject({
      task: { title: 'After edit', description: null, priority: 'HIGH' },
    });

    const invalid = await fetch(`${server.url}/api/tasks/${created.id}`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ status: 'DONE' }),
    });
    expect(invalid.status).toBe(400);
    await expect(invalid.json()).resolves.toMatchObject({ error: { code: 'INVALID_REQUEST' } });

    const immutable = await fetch(`${server.url}/api/tasks/${created.id}`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ sessionId: 'session-1' }),
    });
    expect(immutable.status).toBe(400);
  });

  it('returns safe structured errors for invalid body, unsupported media type, methods, and unknown APIs', async () => {
    server = await createHttpServer({
      host: '127.0.0.1',
      port: 0,
      taskApplication: createTestApplication(),
    });

    const empty = await fetch(`${server.url}/api/tasks`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
    });
    expect(empty.status).toBe(400);
    await expect(empty.json()).resolves.toMatchObject({ error: { code: 'INVALID_REQUEST' } });

    const media = await fetch(`${server.url}/api/tasks`, { method: 'POST', body: '{}' });
    expect(media.status).toBe(415);
    await expect(media.json()).resolves.toMatchObject({
      error: { code: 'UNSUPPORTED_MEDIA_TYPE' },
    });

    const method = await fetch(`${server.url}/api/tasks`, { method: 'DELETE' });
    expect(method.status).toBe(405);
    expect(method.headers.get('allow')).toBe('GET, POST');

    const unknown = await fetch(`${server.url}/api/not-real`);
    expect(unknown.status).toBe(404);
    await expect(unknown.json()).resolves.toMatchObject({ error: { code: 'NOT_FOUND' } });
  });

  it('rejects unknown query parameters, unsupported JSON charsets, and whitespace-only titles', async () => {
    server = await createHttpServer({
      host: '127.0.0.1',
      port: 0,
      taskApplication: createTestApplication(),
    });

    const query = await fetch(`${server.url}/api/tasks?view=active&debug=true`);
    expect(query.status).toBe(400);

    const charset = await fetch(`${server.url}/api/tasks`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json; charset=utf-16' },
      body: JSON.stringify({ title: 'Wrong charset' }),
    });
    expect(charset.status).toBe(415);

    const whitespace = await fetch(`${server.url}/api/tasks`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ title: '   ' }),
    });
    expect(whitespace.status).toBe(400);
    await expect(whitespace.json()).resolves.toMatchObject({
      error: { code: 'INVALID_REQUEST', details: { title: expect.any(Array) } },
    });
  });

  it('does not expose persistence failures through the HTTP error body', async () => {
    const failingApplication = {
      create: () => {
        throw new TaskPersistenceError('SQLITE disk I/O failure at C:\\relay\\tasks.db');
      },
    } as unknown as TaskApplication;
    server = await createHttpServer({
      host: '127.0.0.1',
      port: 0,
      taskApplication: failingApplication,
    });

    const stderr = vi.spyOn(process.stderr, 'write').mockImplementation(() => true);
    try {
      const response = await fetch(`${server.url}/api/tasks`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ title: 'Persist safely' }),
      });
      expect(response.status).toBe(500);
      await expect(response.json()).resolves.toEqual({
        error: { code: 'INTERNAL_ERROR', message: 'An unexpected internal error occurred.' },
      });
      expect(stderr).not.toHaveBeenCalled();
    } finally {
      stderr.mockRestore();
    }
  });

  it('retrieves tasks and exposes every explicit lifecycle route without generic transitions', async () => {
    server = await createHttpServer({
      host: '127.0.0.1',
      port: 0,
      taskApplication: createTestApplication(),
    });
    const created = await createTask(server.url, 'Every action');
    const get = await fetch(`${server.url}/api/tasks/${created.id}`);
    expect(get.status).toBe(200);
    await expect(get.json()).resolves.toMatchObject({ task: { id: created.id } });

    await action(server.url, created.id, 'activate');
    await action(server.url, created.id, 'activate');
    await action(server.url, created.id, 'start');
    await action(server.url, created.id, 'move-to-backlog');
    await action(server.url, created.id, 'move-to-inbox');

    const invalidTransition = await fetch(`${server.url}/api/tasks/${created.id}/start`, {
      method: 'POST',
    });
    expect(invalidTransition.status).toBe(409);
    await expect(invalidTransition.json()).resolves.toMatchObject({
      error: { code: 'INVALID_TASK_TRANSITION' },
    });

    await action(server.url, created.id, 'activate');
    await action(server.url, created.id, 'complete');
    await action(server.url, created.id, 'archive');

    const missing = await fetch(`${server.url}/api/tasks/not-found`);
    expect(missing.status).toBe(404);
    await expect(missing.json()).resolves.toMatchObject({ error: { code: 'TASK_NOT_FOUND' } });
  });

  it('rejects malformed and non-empty action bodies plus oversize payloads', async () => {
    server = await createHttpServer({
      host: '127.0.0.1',
      port: 0,
      taskApplication: createTestApplication(),
    });
    const created = await createTask(server.url, 'Body validation');

    const malformed = await fetch(`${server.url}/api/tasks`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: '{',
    });
    expect(malformed.status).toBe(400);

    const actionBody = await fetch(`${server.url}/api/tasks/${created.id}/activate`, {
      method: 'POST',
      body: '{}',
    });
    expect(actionBody.status).toBe(400);

    const oversize = await fetch(`${server.url}/api/tasks`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ title: 'x'.repeat(70_000) }),
    });
    expect(oversize.status).toBe(413);
    await expect(oversize.json()).resolves.toMatchObject({ error: { code: 'PAYLOAD_TOO_LARGE' } });
  });

  it('persists an edited completed task across a real runtime restart and hides it after archiving', async () => {
    const temporary = createTemporaryDatabase();
    let firstRuntime: ReturnType<typeof createTaskRuntime> | null = null;
    let firstServer: HttpServerInstance | null = null;
    let secondRuntime: ReturnType<typeof createTaskRuntime> | null = null;
    let secondServer: HttpServerInstance | null = null;

    try {
      temporary.db.close();
      firstRuntime = createTaskRuntime({ databasePath: temporary.dbPath });
      firstServer = await createHttpServer({
        host: '127.0.0.1',
        port: 0,
        taskApplication: firstRuntime.taskApplication,
      });
      const created = await createTask(firstServer.url, 'Persisted workflow task');

      const edit = await fetch(`${firstServer.url}/api/tasks/${created.id}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          title: 'Persisted edited task',
          description: 'Survives a runtime restart',
          priority: 'HIGH',
          workspace: 'relay',
          sourceContext: 'issue-10',
        }),
      });
      expect(edit.status).toBe(200);
      await action(firstServer.url, created.id, 'activate');
      const started = await action(firstServer.url, created.id, 'start');
      await action(firstServer.url, created.id, 'complete');

      await firstServer.stop();
      firstServer = null;
      firstRuntime.close();
      firstRuntime = null;

      secondRuntime = createTaskRuntime({ databasePath: temporary.dbPath });
      secondServer = await createHttpServer({
        host: '127.0.0.1',
        port: 0,
        taskApplication: secondRuntime.taskApplication,
      });
      const retrieved = await fetch(`${secondServer.url}/api/tasks/${created.id}`);
      expect(retrieved.status).toBe(200);
      await expect(retrieved.json()).resolves.toMatchObject({
        task: {
          id: created.id,
          title: 'Persisted edited task',
          description: 'Survives a runtime restart',
          priority: 'HIGH',
          workspace: 'relay',
          sourceContext: 'issue-10',
          status: 'DONE',
          startedAt: started.startedAt,
          completedAt: expect.any(String),
        },
      });
      const completed = await fetch(`${secondServer.url}/api/tasks?view=completed`);
      await expect(completed.json()).resolves.toMatchObject({
        tasks: [expect.objectContaining({ id: created.id })],
      });

      await action(secondServer.url, created.id, 'archive');
      const afterArchive = await fetch(`${secondServer.url}/api/tasks?view=completed`);
      await expect(afterArchive.json()).resolves.toMatchObject({ tasks: [] });
    } finally {
      if (firstServer) await firstServer.stop();
      firstRuntime?.close();
      if (secondServer) await secondServer.stop();
      secondRuntime?.close();
      temporary.cleanup();
    }
  });

  it('creates a migrated production runtime and closes it idempotently', () => {
    const temporary = createTemporaryDatabase();
    temporary.cleanup();
    const runtime = createTaskRuntime({ databasePath: temporary.dbPath });

    expect(
      runtime.taskApplication.create({
        title: 'Runtime task',
        creator: { type: 'HUMAN', name: null },
      }),
    ).toMatchObject({ title: 'Runtime task', status: 'INBOX' });
    expect(() => runtime.close()).not.toThrow();
    expect(() => runtime.close()).not.toThrow();
    temporary.cleanup();
  });

  function createTestApplication(): TaskApplication {
    database = createMigratedTemporaryDatabase();
    return createTaskApplication({ repository: new SqliteTaskRepository(database.db) });
  }

  async function createTask(url: string, title: string): Promise<{ readonly id: string }> {
    const response = await fetch(`${url}/api/tasks`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ title }),
    });
    const body = (await response.json()) as { task: { id: string } };
    return body.task;
  }

  async function action(url: string, id: string, name: string): Promise<Record<string, unknown>> {
    const response = await fetch(`${url}/api/tasks/${id}/${name}`, { method: 'POST' });
    expect(response.status).toBe(200);
    const body = (await response.json()) as { task: Record<string, unknown> };
    return body.task;
  }
});
