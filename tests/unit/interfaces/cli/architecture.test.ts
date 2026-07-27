import { readFileSync, readdirSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';

function sourceFiles(directory: string): string[] {
  return readdirSync(directory, { withFileTypes: true }).flatMap((entry) => {
    const path = join(directory, entry.name);
    return entry.isDirectory() ? sourceFiles(path) : path.endsWith('.ts') ? [path] : [];
  });
}

describe('CLI adapter boundaries', () => {
  it('does not import from the MCP adapter namespace', () => {
    const cliRoot = resolve(
      dirname(fileURLToPath(import.meta.url)),
      '../../../../src/interfaces/cli',
    );
    for (const file of sourceFiles(cliRoot)) {
      expect(readFileSync(file, 'utf8'), file).not.toMatch(/interfaces[\\/]mcp|\.\.\/mcp/);
    }
  });
});
