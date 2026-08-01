import { describe, expect, it } from 'vitest';
import {
  runRelay,
  type RelayCommandDependencies,
} from '../../../../src/interfaces/cli/run-relay.js';

function dependencies(overrides: Partial<RelayCommandDependencies> = {}): RelayCommandDependencies {
  return {
    runTaskCommand: async () => 0,
    runMcp: async () => 0,
    runUi: async () => 0,
    stderr: { write: () => undefined },
    ...overrides,
  };
}

describe('runRelay', () => {
  it('routes mcp without creating a task runtime', async () => {
    const calls: string[] = [];
    const code = await runRelay(
      ['mcp'],
      dependencies({
        runMcp: async () => {
          calls.push('mcp');
        },
      }),
    );
    expect(code).toBe(0);
    expect(calls).toEqual(['mcp']);
  });

  it('propagates a non-zero MCP exit code', async () => {
    await expect(runRelay(['mcp'], dependencies({ runMcp: async () => 1 }))).resolves.toBe(1);
  });

  it('routes ui without creating a task runtime', async () => {
    const calls: string[] = [];
    const code = await runRelay(
      ['ui'],
      dependencies({
        runUi: async () => {
          calls.push('ui');
        },
      }),
    );
    expect(code).toBe(0);
    expect(calls).toEqual(['ui']);
  });

  it('passes every task or session argv unchanged to the existing runner', async () => {
    const received: readonly string[][] = [];
    const code = await runRelay(
      ['task', 'capture', '--title', 'Keep', '--output', 'json'],
      dependencies({
        runTaskCommand: async (argv) => {
          (received as string[][]).push([...argv]);
          return 3;
        },
      }),
    );
    expect(code).toBe(3);
    expect(received).toEqual([['task', 'capture', '--title', 'Keep', '--output', 'json']]);
  });

  it('rejects unknown operational commands with usage exit code 2', async () => {
    let message = '';
    const code = await runRelay(
      ['doctor'],
      dependencies({
        stderr: {
          write: (text) => {
            message += text;
          },
        },
      }),
    );
    expect(code).toBe(2);
    expect(message).toMatch(/unknown.*command/i);
  });
});
