import { execSync } from 'node:child_process';
import { afterEach, beforeAll, describe, expect, it } from 'vitest';
import {
  resolveHttpPort,
  createHttpServer,
  getContentType,
  resolveStaticAsset,
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

beforeAll(() => {
  execSync('pnpm build:web', { stdio: 'inherit' });
});

describe('createHttpServer security restrictions', () => {
  it('throws RelayError if host is not loopback', async () => {
    await expect(createHttpServer({ host: '0.0.0.0' })).rejects.toThrow(RelayError);
  });
});

describe('getContentType', () => {
  it('returns expected content types for supported file extensions', () => {
    expect(getContentType('index.html')).toBe('text/html; charset=utf-8');
    expect(getContentType('bundle.js')).toBe('text/javascript; charset=utf-8');
    expect(getContentType('styles.css')).toBe('text/css; charset=utf-8');
    expect(getContentType('health.json')).toBe('application/json; charset=utf-8');
    expect(getContentType('logo.svg')).toBe('image/svg+xml');
    expect(getContentType('favicon.ico')).toBe('image/x-icon');
    expect(getContentType('archive.bin')).toBe('application/octet-stream');
  });
});

describe('resolveStaticAsset', () => {
  it('resolves the built index.html asset from the web output directory', () => {
    const assetPath = resolveStaticAsset('/');

    expect(assetPath).toBeTruthy();
    expect(assetPath).toMatch(/dist[\\/]web[\\/]index\.html$/);
  });

  it('rejects path traversal outside the built web directory', () => {
    expect(resolveStaticAsset('/../package.json')).toBeNull();
  });

  it('returns null for unknown static files', () => {
    expect(resolveStaticAsset('/assets/does-not-exist.js')).toBeNull();
  });
});
