import { load as parseToml } from 'js-toml';
import type { ClientConfigAdapter, ClientEntryState } from './client-adapter.js';
import { renderIntegrationSnippet } from '../snippets.js';
import { RELAY_ARGS, RELAY_COMMAND, RELAY_ENTRY_ID } from '../relay-entry.js';
import { SetupConflictError, SetupUsageError } from '../setup-errors.js';

const headerPattern = new RegExp(
  `^\\s*\\[mcp_servers\\.${RELAY_ENTRY_ID}\\][^\\r\\n]*(?:\\r?\\n|$)`,
  'gm',
);

export function createCodexTomlAdapter(): ClientConfigAdapter {
  return {
    client: 'codex',
    parse: (content) => parseDocument(content),
    inspect: (content) => inspect(content),
    upsertRelayEntry: (content) => {
      const state = inspect(content);
      if (state.kind === 'matching') return content;
      if (state.kind === 'conflicting')
        throw new SetupConflictError('Codex configuration contains a conflicting relay entry.');
      const newline = newlineFor(content);
      const snippet = renderIntegrationSnippet('codex').replaceAll('\n', newline);
      if (content.length === 0) return snippet;
      return `${content}${content.endsWith(newline) ? newline : `${newline}${newline}`}${snippet}`;
    },
    removeRelayEntry: (content) => {
      const match = singleRelayHeader(content);
      if (match === undefined) return content;
      return `${content.slice(0, match.start)}${content.slice(match.end)}`;
    },
    renderSnippet: () => renderIntegrationSnippet('codex'),
  };
}

function parseDocument(content: string): Record<string, unknown> {
  try {
    return parseToml(content) as Record<string, unknown>;
  } catch {
    throw new SetupUsageError('Codex configuration is malformed.');
  }
}

function inspect(content: string): ClientEntryState {
  const document = parseDocument(content);
  const servers = document.mcp_servers;
  if (servers === undefined) return { kind: 'absent' };
  if (!isRecord(servers))
    throw new SetupUsageError('Codex mcp_servers configuration is malformed.');
  if (servers.relay === undefined) return { kind: 'absent' };
  if (!isRecord(servers.relay)) return { kind: 'conflicting' };
  const command = typeof servers.relay.command === 'string' ? servers.relay.command : undefined;
  const args =
    Array.isArray(servers.relay.args) &&
    servers.relay.args.every((arg): arg is string => typeof arg === 'string')
      ? servers.relay.args
      : undefined;
  const keys = Object.keys(servers.relay);
  if (
    keys.length === 2 &&
    command === RELAY_COMMAND &&
    args?.length === RELAY_ARGS.length &&
    args[0] === RELAY_ARGS[0] &&
    singleRelayHeader(content) !== undefined
  )
    return { kind: 'matching', command, args };
  return {
    kind: 'conflicting',
    ...(command === undefined ? {} : { command }),
    ...(args === undefined ? {} : { args }),
  };
}

function singleRelayHeader(content: string): { start: number; end: number } | undefined {
  const matches = [...content.matchAll(headerPattern)];
  if (matches.length !== 1) {
    if (matches.length > 1)
      throw new SetupConflictError('Codex configuration contains duplicate relay tables.');
    return undefined;
  }
  const match = matches[0];
  if (match === undefined) return undefined;
  if (match.index === undefined) return undefined;
  const nextHeader = /\r?\n\s*\[[^\r\n\]]+\]/g;
  nextHeader.lastIndex = match.index + match[0].length;
  const next = nextHeader.exec(content);
  return { start: match.index, end: next?.index ?? content.length };
}

function newlineFor(content: string): string {
  return content.includes('\r\n') ? '\r\n' : '\n';
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}
