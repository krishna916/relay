import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import { createClaudeJsonAdapter } from '../../../../src/distribution/setup/clients/claude-json-adapter.js';

const fixture = (name: string) =>
  readFileSync(join(process.cwd(), 'tests/fixtures/setup/claude-code', name), 'utf8');

describe('Claude JSON adapter', () => {
  const adapter = createClaudeJsonAdapter();
  it('inserts and removes only the Relay entry', () => {
    const source = fixture('unrelated.json');
    const edited = adapter.upsertRelayEntry(source);
    expect(adapter.inspect(edited).kind).toBe('matching');
    expect(edited).toContain('fixture-secret-never-print');
    expect(adapter.removeRelayEntry(edited)).toContain('other-agent');
    expect(adapter.inspect(adapter.removeRelayEntry(edited)).kind).toBe('absent');
  });
  it('fails closed for malformed and conflicting entries', () => {
    expect(() => adapter.parse(fixture('malformed.json'))).toThrow(/malformed/i);
    expect(adapter.inspect(fixture('conflicting.json')).kind).toBe('conflicting');
  });
  it('preserves matching bytes and CRLF line endings', () => {
    const source = fixture('matching.json');
    expect(adapter.upsertRelayEntry(source)).toBe(source);
    expect(adapter.upsertRelayEntry(fixture('crlf.json').replaceAll('\n', '\r\n'))).toContain(
      '\r\n',
    );
  });
});
