import type { IncomingMessage, ServerResponse } from 'node:http';
import { readFileSync } from 'node:fs';
import type { TaskApplication } from '../../application/tasks/task-application.js';
import { getHealth } from '../../application/health/get-health.js';
import { toHttpError, HttpError } from './http-errors.js';
import { sendError, sendJson } from './http-json.js';
import { routeTaskRequest } from './task-routes.js';

export async function routeHttpRequest(
  request: IncomingMessage,
  response: ServerResponse,
  options: {
    readonly taskApplication: TaskApplication;
    readonly getStaticAsset: (pathname: string) => string | null;
    readonly getContentType: (path: string) => string;
  },
): Promise<void> {
  try {
    const url = new URL(request.url || '/', 'http://127.0.0.1');
    if (url.pathname === '/api/health') {
      if (request.method !== 'GET') {
        sendJson(
          response,
          405,
          {
            error: { code: 'METHOD_NOT_ALLOWED', message: 'Method is not allowed for this route.' },
          },
          { Allow: 'GET' },
        );
        return;
      }
      sendJson(response, 200, getHealth());
      return;
    }
    if (await routeTaskRequest(request, response, url, options.taskApplication)) return;
    if (url.pathname.startsWith('/api/'))
      throw new HttpError(404, 'NOT_FOUND', 'API route was not found.');
    if (request.method === 'GET' || request.method === 'HEAD') {
      const asset = options.getStaticAsset(url.pathname);
      if (asset) {
        response.writeHead(200, { 'Content-Type': options.getContentType(asset) });
        response.end(request.method === 'HEAD' ? undefined : readFileSync(asset));
        return;
      }
    }
    throw new HttpError(404, 'NOT_FOUND', 'Route was not found.');
  } catch (error) {
    const mapped = toHttpError(error);
    if (mapped.status === 500) process.stderr.write('[ERROR] Unhandled HTTP request failure.\n');
    sendError(response, mapped);
  }
}
