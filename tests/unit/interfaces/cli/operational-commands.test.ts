import { resolve } from 'node:path';
import { describe, expect, it } from 'vitest';
import { parseOperationalCommand } from '../../../../src/interfaces/cli/parse-operational-command.js';
import { CliUsageError } from '../../../../src/interfaces/cli/output/cli-errors.js';

describe('parseOperationalCommand', () => {
  const absoluteConfigPath = resolve('tmp', 'codex.toml');

  it('parses setup preview and explicit apply', () => {
    expect(parseOperationalCommand(['setup'])).toEqual({ kind: 'setup', apply: false });
    expect(
      parseOperationalCommand([
        'setup',
        '--client',
        'codex',
        '--config-file',
        absoluteConfigPath,
        '--apply',
      ]),
    ).toEqual({ kind: 'setup', client: 'codex', configFile: absoluteConfigPath, apply: true });
  });
  it('rejects unsafe or unsupported mutation grammar', () => {
    for (const argv of [
      ['setup', '--client', 'codex', '--config-file', 'relative.toml'],
      ['setup', '--client', 'generic-mcp', '--apply'],
      ['setup', '--client', 'generic-mcp', '--config-file', absoluteConfigPath],
      ['config', 'disable', '--client', 'codex', '--config-file', absoluteConfigPath],
      [
        'config',
        'remove',
        '--client',
        'codex',
        '--config-file',
        absoluteConfigPath,
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
    expect(
      parseOperationalCommand([
        'config',
        'disable',
        '--client',
        'codex',
        '--config-file',
        absoluteConfigPath,
        '--apply',
      ]),
    ).toEqual({
      kind: 'config-disable',
      client: 'codex',
      configFile: absoluteConfigPath,
      apply: true,
    });
    expect(
      parseOperationalCommand([
        'config',
        'remove',
        '--client',
        'codex',
        '--config-file',
        absoluteConfigPath,
        '--apply',
      ]),
    ).toEqual({
      kind: 'config-remove',
      client: 'codex',
      configFile: absoluteConfigPath,
      apply: true,
    });
  });
});
