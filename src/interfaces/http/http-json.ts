import type { IncomingMessage, ServerResponse } from 'node:http';
import { HttpError, invalidRequest } from './http-errors.js';

const MAX_BODY_BYTES = 64 * 1024;

export function sendJson(
  response: ServerResponse,
  status: number,
  body: unknown,
  headers: Record<string, string> = {},
): void {
  response.writeHead(status, { 'Content-Type': 'application/json; charset=utf-8', ...headers });
  response.end(JSON.stringify(body));
}

export function sendError(response: ServerResponse, error: HttpError): void {
  const payload =
    error.details && Object.keys(error.details).length > 0
      ? { error: { code: error.code, message: error.message, details: error.details } }
      : { error: { code: error.code, message: error.message } };
  sendJson(response, error.status, payload);
}

export async function readJsonBody(request: IncomingMessage): Promise<unknown> {
  if (!isJsonContentType(request.headers['content-type']))
    throw new HttpError(415, 'UNSUPPORTED_MEDIA_TYPE', 'Content-Type must be application/json.');
  const text = await readBody(request);
  if (text.length === 0) throw invalidRequest('Request body is required.');
  try {
    return JSON.parse(text) as unknown;
  } catch {
    throw invalidRequest('Request body must contain valid JSON.');
  }
}

export async function requireEmptyBody(request: IncomingMessage): Promise<void> {
  if ((await readBody(request)).length !== 0)
    throw invalidRequest('This action does not accept a request body.');
}

function isJsonContentType(value: string | undefined): boolean {
  return value !== undefined && /^application\/json(?:\s*;\s*charset=utf-8)?\s*$/i.test(value);
}

function readBody(request: IncomingMessage): Promise<string> {
  return new Promise((resolve, reject) => {
    const chunks: Buffer[] = [];
    let size = 0;
    let settled = false;
    const settle = (callback: () => void) => {
      if (settled) return;
      settled = true;
      request.off('data', onData);
      request.off('end', onEnd);
      request.off('error', onError);
      request.off('aborted', onAborted);
      callback();
    };
    const onData = (chunk: Buffer) => {
      size += chunk.length;
      if (size > MAX_BODY_BYTES) {
        request.resume();
        settle(() =>
          reject(new HttpError(413, 'PAYLOAD_TOO_LARGE', 'Request body exceeds 64 KiB.')),
        );
        return;
      }
      chunks.push(chunk);
    };
    const onEnd = () => settle(() => resolve(Buffer.concat(chunks).toString('utf8')));
    const onError = () => settle(() => reject(invalidRequest('Request body could not be read.')));
    const onAborted = () => settle(() => reject(invalidRequest('Request body was aborted.')));
    request.on('data', onData);
    request.on('end', onEnd);
    request.on('error', onError);
    request.on('aborted', onAborted);
  });
}
