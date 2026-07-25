import { describe, it, expect } from 'vitest';
import { getHealth } from '../../../src/application/health/get-health.js';

describe('getHealth', () => {
  it('returns exact deterministic health status contract', () => {
    const health = getHealth();
    expect(health).toEqual({
      name: 'relay',
      status: 'ok',
      version: '0.1.0',
    });
  });
});
