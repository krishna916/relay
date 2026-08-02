import { describe, expect, it } from 'vitest';
import { RelayError } from '../../../../src/shared/errors.js';
import { writeOperationalError } from '../../../../src/interfaces/cli/operational-output.js';

describe('operational output errors', () => {
  it('keeps base RelayError failures internal and writes details only to stderr', () => {
    const stdout: string[] = [];
    const stderr: string[] = [];
    const code = writeOperationalError(
      { write: (text) => stdout.push(text) },
      { write: (text) => stderr.push(text) },
      new RelayError('private implementation detail'),
    );

    expect(code).toBe(1);
    expect(stdout[0]).toContain('"code":"INTERNAL_ERROR"');
    expect(stdout[0]).not.toContain('private implementation detail');
    expect(stderr.join('')).toContain('private implementation detail');
  });
});
