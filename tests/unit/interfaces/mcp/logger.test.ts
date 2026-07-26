import { afterEach, describe, expect, it, vi } from 'vitest';
import { mcpLogger } from '../../../../src/interfaces/mcp/logger.js';

describe('mcpLogger', () => {
  const stderr = vi.spyOn(process.stderr, 'write').mockImplementation(() => true);
  const stdout = vi.spyOn(process.stdout, 'write').mockImplementation(() => true);

  afterEach(() => {
    stderr.mockClear();
    stdout.mockClear();
    stderr.mockRestore();
    stdout.mockRestore();
  });

  it('writes startup diagnostics to stderr without contaminating stdout', () => {
    mcpLogger.error('Fatal error starting MCP stdio server', new Error('connection refused'));

    expect(stderr).toHaveBeenCalledWith(
      '[ERROR] Fatal error starting MCP stdio server: connection refused\n',
    );
    expect(stdout).not.toHaveBeenCalled();
  });
});
