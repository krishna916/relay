import { describe, it, expect, afterEach } from 'vitest';
import {
  createHttpServer,
  type HttpServerInstance,
} from '../../src/interfaces/http/create-http-server.js';

describe('http-health integration', () => {
  let serverInstance: HttpServerInstance | null = null;

  afterEach(async () => {
    if (serverInstance) {
      await serverInstance.stop();
      serverInstance = null;
    }
  });

  it('starts on 127.0.0.1 and returns 200 for GET /api/health', async () => {
    serverInstance = await createHttpServer({ host: '127.0.0.1', port: 0 });
    const { url } = serverInstance;

    const res = await fetch(`${url}/api/health`);
    expect(res.status).toBe(200);
    expect(res.headers.get('content-type')).toContain('application/json');

    const body = (await res.json()) as { name: string; status: string; version: string };
    expect(body).toEqual({ name: 'relay', status: 'ok', version: '0.1.0' });
  });

  it('returns 405 Method Not Allowed for POST /api/health', async () => {
    serverInstance = await createHttpServer({ host: '127.0.0.1', port: 0 });
    const { url } = serverInstance;

    const res = await fetch(`${url}/api/health`, { method: 'POST' });
    expect(res.status).toBe(405);
    expect(res.headers.get('allow')).toBe('GET');
  });

  it('returns 404 Not Found for unknown routes', async () => {
    serverInstance = await createHttpServer({ host: '127.0.0.1', port: 0 });
    const { url } = serverInstance;

    const res = await fetch(`${url}/unknown-route`);
    expect(res.status).toBe(404);
    const body = (await res.json()) as { error: string };
    expect(body).toEqual({ error: 'not_found' });
  });
});
