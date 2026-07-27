import { isTaskPriority, type TaskPriority } from '../../domain/task/task-priority.js';
import { isTaskStatus, TASK_STATUSES } from '../../domain/task/task-status.js';
import { MAX_SESSION_ID_LENGTH, SESSION_ID_PATTERN } from '../../shared/session-id-rules.js';
import { CliUsageError } from './output/cli-errors.js';
import type {
  CliCommand,
  SessionCapturesCommand,
  TaskCaptureCommand,
  TaskEditCommand,
  TaskFindSimilarCommand,
  TaskGetCommand,
  TaskLifecycleCommand,
  TaskListCommand,
  TaskTriageCommand,
} from './cli-command.js';

const MAX_ID_LENGTH = 100;
const MAX_TITLE_LENGTH = 300;
const MAX_DESCRIPTION_LENGTH = 10_000;
const MAX_WORKSPACE_LENGTH = 255;
const MAX_SOURCE_CONTEXT_LENGTH = 1_000;
const MAX_AGENT_LENGTH = 100;

type OptionSpec = { readonly value: boolean; readonly repeatable?: boolean };
type OptionSpecs = Readonly<Record<string, OptionSpec>>;

const OUTPUT_OPTION: OptionSpec = { value: true };
const captureOptions: OptionSpecs = {
  title: { value: true },
  agent: { value: true },
  session: { value: true },
  description: { value: true },
  priority: { value: true },
  workspace: { value: true },
  'source-context': { value: true },
  output: OUTPUT_OPTION,
};
const listOptions: OptionSpecs = {
  status: { value: true, repeatable: true },
  workspace: { value: true },
  limit: { value: true },
  output: OUTPUT_OPTION,
};
const getOptions: OptionSpecs = { output: OUTPUT_OPTION };
const findSimilarOptions: OptionSpecs = {
  title: { value: true },
  workspace: { value: true },
  limit: { value: true },
  output: OUTPUT_OPTION,
};
const editOptions: OptionSpecs = {
  title: { value: true },
  description: { value: true },
  priority: { value: true },
  workspace: { value: true },
  'source-context': { value: true },
  'clear-description': { value: false },
  'clear-priority': { value: false },
  'clear-workspace': { value: false },
  'clear-source-context': { value: false },
  output: OUTPUT_OPTION,
};
const triageOptions: OptionSpecs = { to: { value: true }, output: OUTPUT_OPTION };
const lifecycleOptions: OptionSpecs = { output: OUTPUT_OPTION };
const sessionOptions: OptionSpecs = {
  session: { value: true },
  limit: { value: true },
  output: OUTPUT_OPTION,
};

export function parseCli(argv: readonly string[]): CliCommand {
  const [group, action, ...tokens] = argv;
  if (group !== 'task' && group !== 'session') {
    throw new CliUsageError('Unknown or missing command.');
  }
  if (action === undefined) {
    throw new CliUsageError('Unknown or missing command.');
  }

  if (group === 'session') {
    if (action !== 'captures') throw new CliUsageError(`Unknown command: session ${action}.`);
    return parseSessionCaptures(tokens);
  }

  const idActions = new Set(['get', 'edit', 'triage', 'start', 'complete', 'archive']);
  const id = idActions.has(action) ? readId(tokens.shift(), 'task id') : undefined;
  switch (action) {
    case 'capture':
      if (id !== undefined) throw new CliUsageError('task capture does not accept a task id.');
      return parseTaskCapture(tokens);
    case 'list':
      if (id !== undefined) throw new CliUsageError('task list does not accept a task id.');
      return parseTaskList(tokens);
    case 'get':
      return parseTaskGet(id, tokens);
    case 'find-similar':
      if (id !== undefined) throw new CliUsageError('task find-similar does not accept a task id.');
      return parseTaskFindSimilar(tokens);
    case 'edit':
      return parseTaskEdit(id, tokens);
    case 'triage':
      return parseTaskTriage(id, tokens);
    case 'start':
      return parseTaskLifecycle('start', id, tokens);
    case 'complete':
      return parseTaskLifecycle('complete', id, tokens);
    case 'archive':
      return parseTaskLifecycle('archive', id, tokens);
    default:
      throw new CliUsageError(`Unknown command: task ${action}.`);
  }
}

function parseTaskCapture(tokens: readonly string[]): TaskCaptureCommand {
  const options = parseOptions(tokens, captureOptions);
  requireJsonOutput(options);
  return {
    kind: 'task.capture',
    title: requiredText(options, 'title', MAX_TITLE_LENGTH),
    agent: requiredText(options, 'agent', MAX_AGENT_LENGTH),
    sessionId: requiredSession(options, 'session'),
    ...optionalTextProperty(options, 'description', MAX_DESCRIPTION_LENGTH),
    ...optionalPriorityProperty(options),
    ...optionalTextProperty(options, 'workspace', MAX_WORKSPACE_LENGTH),
    ...optionalTextProperty(options, 'source-context', MAX_SOURCE_CONTEXT_LENGTH, 'sourceContext'),
  };
}

function parseTaskList(tokens: readonly string[]): TaskListCommand {
  const options = parseOptions(tokens, listOptions);
  requireJsonOutput(options);
  const rawStatuses = options.get('status');
  const statuses =
    rawStatuses === undefined
      ? [...TASK_STATUSES]
      : rawStatuses.map((value) => enumValue(value, isTaskStatus, 'status'));
  return {
    kind: 'task.list',
    statuses,
    ...optionalTextProperty(options, 'workspace', MAX_WORKSPACE_LENGTH),
    limit: integerOption(options, 'limit', 100, 100),
  };
}

function parseTaskGet(id: string | undefined, tokens: readonly string[]): TaskGetCommand {
  const taskId = requiredId(id);
  const options = parseOptions(tokens, getOptions);
  requireJsonOutput(options);
  return { kind: 'task.get', id: taskId };
}

function parseTaskFindSimilar(tokens: readonly string[]): TaskFindSimilarCommand {
  const options = parseOptions(tokens, findSimilarOptions);
  requireJsonOutput(options);
  return {
    kind: 'task.find-similar',
    title: requiredText(options, 'title', MAX_TITLE_LENGTH),
    ...optionalTextProperty(options, 'workspace', MAX_WORKSPACE_LENGTH),
    limit: integerOption(options, 'limit', 5, 5),
  };
}

function parseTaskEdit(id: string | undefined, tokens: readonly string[]): TaskEditCommand {
  const taskId = requiredId(id);
  const options = parseOptions(tokens, editOptions);
  requireJsonOutput(options);
  assertClearConflicts(options);
  const changes: TaskEditCommand['changes'] = {
    ...optionalTextProperty(options, 'title', MAX_TITLE_LENGTH),
    ...optionalTextProperty(options, 'description', MAX_DESCRIPTION_LENGTH),
    ...optionalPriorityProperty(options),
    ...optionalTextProperty(options, 'workspace', MAX_WORKSPACE_LENGTH),
    ...optionalTextProperty(options, 'source-context', MAX_SOURCE_CONTEXT_LENGTH, 'sourceContext'),
    ...(options.has('clear-description') ? { description: null } : {}),
    ...(options.has('clear-priority') ? { priority: null } : {}),
    ...(options.has('clear-workspace') ? { workspace: null } : {}),
    ...(options.has('clear-source-context') ? { sourceContext: null } : {}),
  };
  if (Object.keys(changes).length === 0)
    throw new CliUsageError('At least one editable task field is required.');
  return { kind: 'task.edit', id: taskId, changes };
}

function assertClearConflicts(options: ReadonlyMap<string, readonly string[]>): void {
  const pairs = [
    ['description', 'clear-description'],
    ['priority', 'clear-priority'],
    ['workspace', 'clear-workspace'],
    ['source-context', 'clear-source-context'],
  ] as const;
  for (const [valueKey, clearKey] of pairs) {
    if (options.has(valueKey) && options.has(clearKey)) {
      throw new CliUsageError(`--${valueKey} cannot be supplied with --${clearKey}.`);
    }
  }
}

function parseTaskTriage(id: string | undefined, tokens: readonly string[]): TaskTriageCommand {
  const taskId = requiredId(id);
  const options = parseOptions(tokens, triageOptions);
  requireJsonOutput(options);
  return {
    kind: 'task.triage',
    id: taskId,
    target: enumValue(option(options, 'to'), isTriageTarget, 'to'),
  };
}

function parseTaskLifecycle(
  action: 'start',
  id: string | undefined,
  tokens: readonly string[],
): Extract<TaskLifecycleCommand, { readonly action: 'start' }>;
function parseTaskLifecycle(
  action: 'complete',
  id: string | undefined,
  tokens: readonly string[],
): Extract<TaskLifecycleCommand, { readonly action: 'complete' }>;
function parseTaskLifecycle(
  action: 'archive',
  id: string | undefined,
  tokens: readonly string[],
): Extract<TaskLifecycleCommand, { readonly action: 'archive' }>;
function parseTaskLifecycle(
  action: TaskLifecycleCommand['action'],
  id: string | undefined,
  tokens: readonly string[],
): TaskLifecycleCommand {
  const taskId = requiredId(id);
  const options = parseOptions(tokens, lifecycleOptions);
  requireJsonOutput(options);
  switch (action) {
    case 'start':
      return { kind: 'task.start', action, id: taskId };
    case 'complete':
      return { kind: 'task.complete', action, id: taskId };
    case 'archive':
      return { kind: 'task.archive', action, id: taskId };
  }
}

function parseSessionCaptures(tokens: readonly string[]): SessionCapturesCommand {
  const options = parseOptions(tokens, sessionOptions);
  requireJsonOutput(options);
  return {
    kind: 'session.captures',
    sessionId: requiredSession(options, 'session'),
    limit: integerOption(options, 'limit', 100, 100),
  };
}

function parseOptions(
  tokens: readonly string[],
  specs: OptionSpecs,
): ReadonlyMap<string, readonly string[]> {
  const options = new Map<string, string[]>();
  for (let index = 0; index < tokens.length; index += 1) {
    const token = tokens[index];
    if (token === undefined || !token.startsWith('--')) {
      throw new CliUsageError(`Unexpected argument: ${token ?? ''}`.trim());
    }
    const key = token.slice(2);
    const spec = specs[key];
    if (spec === undefined) throw new CliUsageError(`Unknown option --${key}.`);
    const existing = options.get(key);
    if (existing !== undefined && !spec.repeatable)
      throw new CliUsageError(`Option --${key} may be supplied only once.`);
    if (!spec.value) {
      options.set(key, [...(existing ?? []), 'true']);
      continue;
    }
    const value = tokens[index + 1];
    if (value === undefined || value.startsWith('--'))
      throw new CliUsageError(`Missing value for --${key}.`);
    index += 1;
    options.set(key, [...(existing ?? []), value]);
  }
  return options;
}

function requireJsonOutput(options: ReadonlyMap<string, readonly string[]>): void {
  if (option(options, 'output') !== 'json')
    throw new CliUsageError('All supported commands require --output json.');
}

function option(options: ReadonlyMap<string, readonly string[]>, key: string): string | undefined {
  return options.get(key)?.[0];
}

function requiredText(
  options: ReadonlyMap<string, readonly string[]>,
  key: string,
  maximum: number,
): string {
  const value = option(options, key);
  if (value === undefined) throw new CliUsageError(`Missing required option --${key}.`);
  return boundedText(value, `--${key}`, maximum);
}

function requiredSession(options: ReadonlyMap<string, readonly string[]>, key: string): string {
  const value = requiredText(options, key, MAX_SESSION_ID_LENGTH);
  if (!SESSION_ID_PATTERN.test(value))
    throw new CliUsageError(`--${key} is not a valid session id.`);
  return value;
}

function readId(value: string | undefined, label: string): string | undefined {
  if (value === undefined) return undefined;
  if (value.startsWith('--')) throw new CliUsageError(`A ${label} is required.`);
  return boundedText(value, label, MAX_ID_LENGTH);
}

function requiredId(value: string | undefined): string {
  if (value === undefined) throw new CliUsageError('A task id is required.');
  return value;
}

function boundedText(value: string, label: string, maximum: number): string {
  const normalized = value.trim();
  if (normalized.length === 0) throw new CliUsageError(`${label} must not be empty.`);
  if (normalized.length > maximum) throw new CliUsageError(`${label} exceeds its maximum length.`);
  return normalized;
}

function optionalTextProperty(
  options: ReadonlyMap<string, readonly string[]>,
  key: string,
  maximum: number,
  property = key,
): Record<string, string> {
  const value = option(options, key);
  return value === undefined ? {} : { [property]: boundedText(value, `--${key}`, maximum) };
}

function optionalPriorityProperty(
  options: ReadonlyMap<string, readonly string[]>,
): Record<string, TaskPriority> {
  const value = option(options, 'priority');
  return value === undefined ? {} : { priority: enumValue(value, isTaskPriority, 'priority') };
}

function integerOption(
  options: ReadonlyMap<string, readonly string[]>,
  key: string,
  maximum: number,
  fallback: number,
): number {
  const raw = option(options, key);
  if (raw === undefined) return fallback;
  const value = Number(raw);
  if (!Number.isInteger(value) || value < 1 || value > maximum)
    throw new CliUsageError(`--${key} must be an integer from 1 through ${maximum}.`);
  return value;
}

function enumValue<T extends string>(
  value: string | undefined,
  predicate: (value: unknown) => value is T,
  key: string,
): T {
  if (value === undefined || !predicate(value))
    throw new CliUsageError(`--${key} has an invalid value.`);
  return value;
}

function isTriageTarget(value: unknown): value is 'INBOX' | 'ACTIVE' | 'BACKLOG' {
  return value === 'INBOX' || value === 'ACTIVE' || value === 'BACKLOG';
}
