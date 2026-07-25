import { describe, it, expect, afterEach } from 'vitest';
import {
  resolveHttpPort,
  createHttpServer,
} from '../../../../src/interfaces/http/create-http-server.js';
import { RelayError } from '../../../../src/shared/errors.js';

describe('resolveHttpPort', () => {
  const origEnv = process.env.RELAY_HTTP_PORT;

  afterEach(() => {
    if (origEnv !== undefined) {
      process.env.RELAY_HTTP_PORT = origEnv;
    } else {
      delete process.env.RELAY_HTTP_PORT;
    }
  });

  it('returns explicit port when valid', () => {
    expect(resolveHttpPort(8080)).toBe(8080);
  });

  it('throws RelayError for invalid explicit port', () => {
    expect(() => resolveHttpPort(-1)).toThrow(RelayError);
    expect(() => resolveHttpPort(70000)).toThrow(RelayError);
  });

  it('uses RELAY_HTTP_PORT environment variable when valid', () => {
    process.env.RELAY_HTTP_PORT = '9090';
    expect(resolveHttpPort()).toBe(9090);
  });

  it('throws RelayError for invalid RELAY_HTTP_PORT environment variable', () => {
    process.env.RELAY_HTTP_PORT = 'invalid';
    expect(() => resolveHttpPort()).toThrow(RelayError);
  });

  it('defaults to 43110 when no explicit port or env var is set', () => {
    delete process.env.RELAY_HTTP_PORT;
    expect(resolveHttpPort()).toBe(43110);
  });
});

describe('createHttpServer security restrictions', () => {
  it('throws RelayError if host is not loopback', async () => {
    await expect(createHttpServer({ host: '0.0.0.0' })).rejects.toThrow(RelayError);
  });
});
