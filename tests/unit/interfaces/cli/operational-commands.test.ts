import { describe, expect, it } from 'vitest';
import { parseOperationalCommand } from '../../../../src/interfaces/cli/parse-operational-command.js';
import { CliUsageError } from '../../../../src/interfaces/cli/output/cli-errors.js';

describe('parseOperationalCommand', () => {
  it('parses setup preview and explicit apply', () => {
    expect(parseOperationalCommand(['setup'])).toEqual({ kind: 'setup', apply: false });
    expect(
      parseOperationalCommand([
        'setup',
        '--client',
        'codex',
        '--config-file',
        'C:/tmp/codex.toml',
        '--apply',
      ]),
    ).toEqual({ kind: 'setup', client: 'codex', configFile: 'C:/tmp/codex.toml', apply: true });
  });
  it('rejects unsafe or unsupported mutation grammar', () => {
    for (const argv of [
      ['setup', '--client', 'codex', '--config-file', 'relative.toml'],
      ['setup', '--client', 'generic-mcp', '--apply'],
      ['setup', '--client', 'generic-mcp', '--config-file', 'C:/tmp/mcp.json'],
      ['config', 'disable', '--client', 'codex', '--config-file', 'C:/tmp/codex.toml'],
      [
        'config',
        'remove',
        '--client',
        'codex',
        '--config-file',
        'C:/tmp/codex.toml',
        '--apply',
        '--apply',
      ],
    ])
      expect(() => parseOperationalCommand(argv)).toThrow(CliUsageError);
  });
  it('parses snippet and inspection commands', () => {
    expect(parseOperationalCommand(['config', 'paths'])).toEqual({ kind: 'config-paths' });
    expect(parseOperationalCommand(['config', 'integrations'])).toEqual({
      kind: 'config-integrations',
    });
    expect(parseOperationalCommand(['config', 'snippet', '--client', 'generic-mcp'])).toEqual({
      kind: 'config-snippet',
      client: 'generic-mcp',
    });
  });
});
