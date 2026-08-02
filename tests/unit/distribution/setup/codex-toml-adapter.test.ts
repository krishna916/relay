import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import { createCodexTomlAdapter } from '../../../../src/distribution/setup/clients/codex-toml-adapter.js';

const fixture = (name: string) =>
  readFileSync(join(process.cwd(), 'tests/fixtures/setup/codex', name), 'utf8');

describe('Codex TOML adapter', () => {
  const adapter = createCodexTomlAdapter();
  it('inserts and removes only the Relay table', () => {
    const source = fixture('unrelated.toml');
    const edited = adapter.upsertRelayEntry(source);
    expect(adapter.inspect(edited).kind).toBe('matching');
    expect(edited).toContain('fixture-secret-never-print');
    const removed = adapter.removeRelayEntry(edited);
    expect(adapter.inspect(removed).kind).toBe('absent');
    expect(removed).toContain('other-agent');
  });
  it('fails closed for malformed and conflicting entries', () => {
    expect(() => adapter.parse(fixture('malformed.toml'))).toThrow(/malformed/i);
    expect(adapter.inspect(fixture('conflicting.toml')).kind).toBe('conflicting');
  });
  it('preserves matching bytes and CRLF line endings', () => {
    const source = fixture('matching.toml');
    expect(adapter.upsertRelayEntry(source)).toBe(source);
    expect(adapter.upsertRelayEntry(fixture('crlf.toml').replaceAll('\n', '\r\n'))).toContain(
      '\r\n',
    );
  });
});
