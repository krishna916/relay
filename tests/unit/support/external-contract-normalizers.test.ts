import { describe, expect, it } from 'vitest';
import {
  normalizeCliSuccess,
  normalizeMcpSuccess,
} from '../../support/external-contract-normalizers.js';

describe('external contract normalizers', () => {
  it('normalizes the allowed CLI success envelope fields', () => {
    expect(
      normalizeCliSuccess({ schemaVersion: 1, ok: true, data: { count: 0 }, warnings: [] }),
    ).toEqual({ schemaVersion: 1, data: { count: 0 }, warnings: [] });
  });

  it('rejects renamed or unexpected CLI success envelope fields', () => {
    expect(() =>
      normalizeCliSuccess({ schemaVersion: 1, ok: true, data: {}, warning: [] }),
    ).toThrow(/CLI result.*keys/i);
  });

  it('normalizes the allowed MCP structured success envelope fields', () => {
    expect(
      normalizeMcpSuccess({
        structuredContent: { schemaVersion: 1, data: { count: 0 }, warnings: [] },
        content: [],
      }),
    ).toEqual({ schemaVersion: 1, data: { count: 0 }, warnings: [] });
  });

  it('rejects renamed or unexpected MCP structured success fields', () => {
    expect(() =>
      normalizeMcpSuccess({
        structuredContent: { schemaVersion: 1, data: {}, warning: [] },
        content: [],
      }),
    ).toThrow(/MCP structured result.*keys/i);
  });
});
