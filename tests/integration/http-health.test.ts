import { execSync } from 'node:child_process';
import { afterEach, beforeAll, describe, expect, it } from 'vitest';
import {
  createHttpServer,
  type HttpServerInstance,
} from '../../src/interfaces/http/create-http-server.js';
import { createTaskApplication } from '../../src/application/tasks/task-application.js';
import { SqliteTaskRepository } from '../../src/database/tasks/sqlite-task-repository.js';
import {
  createMigratedTemporaryDatabase,
  type TemporaryDatabaseContext,
} from '../support/temporary-database.js';

describe('http-health integration', () => {
  let serverInstance: HttpServerInstance | null = null;
  let database: TemporaryDatabaseContext | null = null;

  beforeAll(() => {
    execSync('pnpm build:web', { stdio: 'inherit' });
  });

  afterEach(async () => {
    if (serverInstance) {
      await serverInstance.stop();
      serverInstance = null;
    }
    database?.cleanup();
    database = null;
  });

  function createServer(): Promise<HttpServerInstance> {
    database = createMigratedTemporaryDatabase();
    return createHttpServer({
      host: '127.0.0.1',
      port: 0,
      taskApplication: createTaskApplication({ repository: new SqliteTaskRepository(database.db) }),
    });
  }

  it('starts on 127.0.0.1 and returns 200 for GET /api/health', async () => {
    serverInstance = await createServer();
    const { url } = serverInstance;

    const res = await fetch(`${url}/api/health`);
    expect(res.status).toBe(200);
    expect(res.headers.get('content-type')).toContain('application/json');

    const body = (await res.json()) as { name: string; status: string; version: string };
    expect(body).toEqual({ name: 'relay', status: 'ok', version: '0.1.0' });
  });

  it('returns 405 Method Not Allowed for POST /api/health', async () => {
    serverInstance = await createServer();
    const { url } = serverInstance;

    const res = await fetch(`${url}/api/health`, { method: 'POST' });
    expect(res.status).toBe(405);
    expect(res.headers.get('allow')).toBe('GET');
  });

  it('serves the web shell for unknown client routes', async () => {
    serverInstance = await createServer();
    const { url } = serverInstance;

    const res = await fetch(`${url}/unknown-route`);
    expect(res.status).toBe(200);
    expect(res.headers.get('content-type')).toContain('text/html');
    await expect(res.text()).resolves.toContain('<div id="root"></div>');

    const apiResponse = await fetch(`${url}/api/unknown-route`);
    expect(apiResponse.status).toBe(404);
  });

  it('serves the built web shell from GET / when present', async () => {
    serverInstance = await createServer();
    const { url } = serverInstance;

    const res = await fetch(`${url}/`);

    expect(res.status).toBe(200);
    expect(res.headers.get('content-type')).toContain('text/html');
    await expect(res.text()).resolves.toContain('<div id="root"></div>');
  });

  it('serves built JavaScript assets and supports HEAD for static files', async () => {
    serverInstance = await createServer();
    const { url } = serverInstance;

    const html = await fetch(`${url}/`).then((response) => response.text());
    const assetPath = html.match(/src="([^"]+assets\/[^"]+\.js)"/)?.[1];

    expect(assetPath).toBeDefined();

    const headResponse = await fetch(`${url}/`, { method: 'HEAD' });
    expect(headResponse.status).toBe(200);
    expect(await headResponse.text()).toBe('');

    const assetResponse = await fetch(`${url}${assetPath}`);
    expect(assetResponse.status).toBe(200);
    expect(assetResponse.headers.get('content-type')).toContain('text/javascript');
  });
});
