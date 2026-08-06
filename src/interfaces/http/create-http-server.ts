import { createServer, type IncomingMessage, type ServerResponse, type Server } from 'node:http';
import { existsSync, statSync } from 'node:fs';
import { extname, relative, resolve } from 'node:path';
import type { TaskApplication } from '../../application/tasks/task-application.js';
import { RelayError } from '../../shared/errors.js';
import { resolvePackageAssets, type PackageAssets } from '../../distribution/package-assets.js';
import { routeHttpRequest } from './http-router.js';

export interface HttpServerOptions {
  readonly host?: string;
  readonly port?: number;
  readonly taskApplication: TaskApplication;
  readonly assets?: PackageAssets;
}

export interface HttpServerInstance {
  readonly server: Server;
  readonly host: string;
  readonly port: number;
  readonly url: string;
  readonly stop: () => Promise<void>;
}

export function getContentType(filePath: string): string {
  switch (extname(filePath)) {
    case '.html':
      return 'text/html; charset=utf-8';
    case '.js':
      return 'text/javascript; charset=utf-8';
    case '.css':
      return 'text/css; charset=utf-8';
    case '.json':
      return 'application/json; charset=utf-8';
    case '.svg':
      return 'image/svg+xml';
    case '.ico':
      return 'image/x-icon';
    default:
      return 'application/octet-stream';
  }
}

export function resolveStaticAsset(pathname: string, webBuildDirectory: string): string | null {
  if (!existsSync(webBuildDirectory)) {
    return null;
  }

  const relativePath = pathname === '/' ? 'index.html' : pathname.replace(/^\/+/, '');
  if (!relativePath) {
    return null;
  }

  const candidatePath = resolve(webBuildDirectory, relativePath);
  const relativeToBuildDir = relative(webBuildDirectory, candidatePath);

  if (
    relativeToBuildDir.startsWith('..') ||
    relativeToBuildDir.includes('..\\') ||
    relativeToBuildDir.includes('../')
  ) {
    return null;
  }

  if (!existsSync(candidatePath) || !statSync(candidatePath).isFile()) {
    return null;
  }

  return candidatePath;
}

export function resolveHttpPort(explicitPort?: number): number {
  if (explicitPort !== undefined) {
    if (explicitPort < 0 || explicitPort > 65535) {
      throw new RelayError(`Invalid HTTP port: ${explicitPort}. Must be between 0 and 65535.`);
    }
    return explicitPort;
  }

  const envPort = process.env.RELAY_HTTP_PORT;
  if (envPort) {
    const parsed = Number(envPort);
    if (!/^\d+$/.test(envPort) || parsed > 65535) {
      throw new RelayError(`Invalid RELAY_HTTP_PORT environment variable: ${envPort}.`);
    }
    return parsed;
  }

  return 43110;
}

export function createHttpServer(options: HttpServerOptions): Promise<HttpServerInstance> {
  const host = options.host || '127.0.0.1';
  let port: number;
  let webRoot: string;

  try {
    port = resolveHttpPort(options.port);
    if (host !== '127.0.0.1' && host !== 'localhost') {
      throw new RelayError(
        `Loopback security restriction: HTTP server host must be 127.0.0.1 or localhost (got ${host}).`,
      );
    }
    webRoot = options.assets?.webRoot ?? resolvePackageAssets().webRoot;
  } catch (err) {
    return Promise.reject(err);
  }

  const requestHandler = (req: IncomingMessage, res: ServerResponse) => {
    void routeHttpRequest(req, res, {
      taskApplication: options.taskApplication,
      getStaticAsset: (pathname) => resolveStaticAsset(pathname, webRoot),
      getContentType,
    });
  };

  const server = createServer(requestHandler);

  return new Promise((resolve, reject) => {
    server.on('error', (err) => reject(new RelayError('HTTP server error', err)));

    server.listen(port, host, () => {
      const addr = server.address();
      const actualPort = typeof addr === 'object' && addr ? addr.port : port;
      const serverUrl = `http://${host}:${actualPort}`;

      const stop = (): Promise<void> => {
        return new Promise((resStop, rejStop) => {
          server.close((err) => {
            if (err) rejStop(err);
            else resStop();
          });
        });
      };

      resolve({
        server,
        host,
        port: actualPort,
        url: serverUrl,
        stop,
      });
    });
  });
}
