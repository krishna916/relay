import { modify, parse, type ParseError } from 'jsonc-parser';
import type { ClientConfigAdapter, ClientEntryState } from './client-adapter.js';
import type { MutableIntegrationClient } from '../setup-types.js';
import { renderIntegrationSnippet } from '../snippets.js';
import { RELAY_ENTRY, RELAY_ENTRY_ID } from '../relay-entry.js';
import { SetupUsageError } from '../setup-errors.js';

export function createClaudeJsonAdapter(): ClientConfigAdapter {
  return {
    client: 'claude-code',
    parse: (content) => readDocument(content),
    inspect: (content) => inspect(readDocument(content)),
    upsertRelayEntry: (content) => {
      const document = readDocument(content);
      if (inspect(document).kind === 'matching') return content;
      const edits = modify(content, ['mcpServers', RELAY_ENTRY_ID], RELAY_ENTRY, {
        formattingOptions: { insertSpaces: true, tabSize: 2, eol: newlineFor(content) },
      });
      return applyEdits(content, edits);
    },
    removeRelayEntry: (content) => {
      readDocument(content);
      const edits = modify(content, ['mcpServers', 'relay'], undefined, {
        formattingOptions: { insertSpaces: true, tabSize: 2, eol: newlineFor(content) },
      });
      return applyEdits(content, edits);
    },
    renderSnippet: () => renderIntegrationSnippet('claude-code'),
  };
}

function readDocument(content: string): Record<string, unknown> {
  if (content.trim() === '') return {};
  const errors: ParseError[] = [];
  const value = parse(content, errors, { allowTrailingComma: true });
  if (
    errors.length > 0 ||
    !isRecord(value) ||
    (value.mcpServers !== undefined && !isRecord(value.mcpServers))
  ) {
    throw new SetupUsageError('Claude Code configuration is malformed.');
  }
  return value;
}

function inspect(document: Record<string, unknown>): ClientEntryState {
  const servers = document.mcpServers;
  if (servers === undefined) return { kind: 'absent' };
  if (!isRecord(servers))
    throw new SetupUsageError('Claude Code mcpServers configuration is malformed.');
  const relay = servers.relay;
  if (relay === undefined) return { kind: 'absent' };
  if (!isRecord(relay)) return { kind: 'conflicting' };
  const command = typeof relay.command === 'string' ? relay.command : undefined;
  const args =
    Array.isArray(relay.args) && relay.args.every((arg): arg is string => typeof arg === 'string')
      ? relay.args
      : undefined;
  const keys = Object.keys(relay);
  if (
    keys.length === 2 &&
    command === RELAY_ENTRY.command &&
    args?.length === RELAY_ENTRY.args.length &&
    args[0] === RELAY_ENTRY.args[0]
  )
    return { kind: 'matching', command, args };
  return {
    kind: 'conflicting',
    ...(command === undefined ? {} : { command }),
    ...(args === undefined ? {} : { args }),
  };
}

function applyEdits(
  content: string,
  edits: readonly { offset: number; length: number; content: string }[],
): string {
  return edits
    .slice()
    .sort((left, right) => right.offset - left.offset)
    .reduce(
      (current, edit) =>
        `${current.slice(0, edit.offset)}${edit.content}${current.slice(edit.offset + edit.length)}`,
      content,
    );
}

function newlineFor(content: string): string {
  return content.includes('\r\n') ? '\r\n' : '\n';
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

export const claudeClient: MutableIntegrationClient = 'claude-code';
