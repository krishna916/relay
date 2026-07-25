import { describe, it, expect, vi, beforeEach } from 'vitest';
import { fetchHealth } from '../../../web/src/api/health-client.js';

describe('health-client', () => {
  beforeEach(() => {
    vi.restoreAllMocks();
  });

  it('parses valid /api/health response', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn().mockResolvedValue({
        ok: true,
        json: async () => ({ name: 'relay', status: 'ok', version: '0.1.0' }),
      }),
    );

    const health = await fetchHealth();
    expect(health).toEqual({ name: 'relay', status: 'ok', version: '0.1.0' });
  });

  it('throws on non-2xx response', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn().mockResolvedValue({
        ok: false,
        status: 500,
      }),
    );

    await expect(fetchHealth()).rejects.toThrow('Health check failed with status 500');
  });

  it('throws on malformed 200 response payload', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn().mockResolvedValue({
        ok: true,
        json: async () => ({ status: 'ok', version: 1 }),
      }),
    );

    await expect(fetchHealth()).rejects.toThrow('Invalid health check response schema');
  });
});
