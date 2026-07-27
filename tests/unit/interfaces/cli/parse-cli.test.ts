import { describe, expect, it } from 'vitest';
import { parseCli } from '../../../../src/interfaces/cli/parse-cli.js';

describe('parseCli', () => {
  it.each([
    [
      'task capture',
      [
        'task',
        'capture',
        '--title',
        'Capture',
        '--agent',
        'Codex',
        '--session',
        's-1',
        '--output',
        'json',
      ],
    ],
    ['task list', ['task', 'list', '--output', 'json']],
    ['task get', ['task', 'get', 'task-1', '--output', 'json']],
    ['task find-similar', ['task', 'find-similar', '--title', 'Find', '--output', 'json']],
    ['task edit', ['task', 'edit', 'task-1', '--title', 'Updated', '--output', 'json']],
    ['task triage', ['task', 'triage', 'task-1', '--to', 'ACTIVE', '--output', 'json']],
    ['task start', ['task', 'start', 'task-1', '--output', 'json']],
    ['task complete', ['task', 'complete', 'task-1', '--output', 'json']],
    ['task archive', ['task', 'archive', 'task-1', '--output', 'json']],
    ['session captures', ['session', 'captures', '--session', 's-1', '--output', 'json']],
  ])('parses the valid minimum invocation for %s', (_name, argv) => {
    expect(() => parseCli(argv)).not.toThrow();
  });

  it('normalizes and types every supported option', () => {
    expect(
      parseCli([
        'task',
        'capture',
        '--title',
        ' Capture ',
        '--description',
        ' Details ',
        '--priority',
        'HIGH',
        '--workspace',
        ' relay ',
        '--source-context',
        ' issue-22 ',
        '--agent',
        ' Codex ',
        '--session',
        ' s-1 ',
        '--output',
        'json',
      ]),
    ).toEqual({
      kind: 'task.capture',
      title: 'Capture',
      description: 'Details',
      priority: 'HIGH',
      workspace: 'relay',
      sourceContext: 'issue-22',
      agent: 'Codex',
      sessionId: 's-1',
    });
  });

  it('supports repeated statuses and maps defaults', () => {
    expect(
      parseCli([
        'task',
        'list',
        '--status',
        'INBOX',
        '--status',
        'DONE',
        '--limit',
        '10',
        '--output',
        'json',
      ]),
    ).toMatchObject({ kind: 'task.list', statuses: ['INBOX', 'DONE'], limit: 10 });
    expect(parseCli(['task', 'list', '--output', 'json'])).toMatchObject({
      kind: 'task.list',
      statuses: ['INBOX', 'ACTIVE', 'IN_PROGRESS', 'BACKLOG', 'DONE', 'ARCHIVED'],
      limit: 100,
    });
  });

  it('turns clear flags into nullable edit changes', () => {
    expect(
      parseCli([
        'task',
        'edit',
        'task-1',
        '--clear-description',
        '--clear-priority',
        '--output',
        'json',
      ]),
    ).toEqual({
      kind: 'task.edit',
      id: 'task-1',
      changes: { description: null, priority: null },
    });
  });

  it.each([
    ['unknown command', ['task', 'unknown', '--output', 'json']],
    [
      'missing required option',
      ['task', 'capture', '--agent', 'Codex', '--session', 's-1', '--output', 'json'],
    ],
    ['unknown option', ['task', 'get', 'task-1', '--bogus', 'value', '--output', 'json']],
    ['missing option value', ['task', 'get', 'task-1', '--output']],
    [
      'duplicate singular option',
      ['task', 'get', 'task-1', '--output', 'json', '--output', 'json'],
    ],
    ['unexpected positional argument', ['task', 'list', 'extra', '--output', 'json']],
    ['invalid status', ['task', 'list', '--status', 'BROKEN', '--output', 'json']],
    [
      'invalid priority',
      [
        'task',
        'capture',
        '--title',
        'Task',
        '--agent',
        'Codex',
        '--session',
        's-1',
        '--priority',
        'URGENT',
        '--output',
        'json',
      ],
    ],
    ['invalid limit', ['task', 'list', '--limit', '101', '--output', 'json']],
    [
      'edit clear/value conflict',
      [
        'task',
        'edit',
        'task-1',
        '--description',
        'text',
        '--clear-description',
        '--output',
        'json',
      ],
    ],
    ['edit with no operation', ['task', 'edit', 'task-1', '--output', 'json']],
    ['non-json output', ['task', 'get', 'task-1', '--output', 'text']],
  ])('rejects %s', (_name, argv) => {
    expect(() => parseCli(argv)).toThrow();
  });
});
