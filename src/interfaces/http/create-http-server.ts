import { createServer, type IncomingMessage, type ServerResponse, type Server } from 'node:http';
import { getHealth } from '../../application/health/get-health.js';
import { RelayError } from '../../shared/errors.js';

export interface HttpServerOptions {
  readonly host?: string;
  readonly port?: number;
}

export interface HttpServerInstance {
  readonly server: Server;
  readonly host: string;
  readonly port: number;
  readonly url: string;
  readonly stop: () => Promise<void>;
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
    const parsed = parseInt(envPort, 10);
    if (isNaN(parsed) || parsed < 1 || parsed > 65535) {
      throw new RelayError(`Invalid RELAY_HTTP_PORT environment variable: ${envPort}.`);
    }
    return parsed;
  }

  return 43110;
}

export function createHttpServer(options: HttpServerOptions = {}): Promise<HttpServerInstance> {
  const host = options.host || '127.0.0.1';
  const port = resolveHttpPort(options.port);

  if (host !== '127.0.0.1' && host !== 'localhost') {
    throw new RelayError(
      `Loopback security restriction: HTTP server host must be 127.0.0.1 or localhost (got ${host}).`,
    );
  }

  const requestHandler = (req: IncomingMessage, res: ServerResponse) => {
    const url = new URL(req.url || '/', `http://${req.headers.host || '127.0.0.1'}`);

    if (url.pathname === '/api/health') {
      if (req.method !== 'GET') {
        res.writeHead(405, { 'Content-Type': 'application/json; charset=utf-8', Allow: 'GET' });
        res.end(JSON.stringify({ error: 'method_not_allowed' }));
        return;
      }

      const health = getHealth();
      res.writeHead(200, { 'Content-Type': 'application/json; charset=utf-8' });
      res.end(JSON.stringify(health));
      return;
    }

    res.writeHead(404, { 'Content-Type': 'application/json; charset=utf-8' });
    res.end(JSON.stringify({ error: 'not_found' }));
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
