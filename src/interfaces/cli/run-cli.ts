import type {
  CreateTaskInput,
  EditTaskInput,
  TaskApplication,
} from '../../application/tasks/task-application.js';
import type { TaskPriority } from '../../domain/task/task-priority.js';
import { TASK_STATUSES, type TaskStatus } from '../../domain/task/task-status.js';
import type { TaskRuntime } from '../shared/create-task-runtime.js';
import { editChange, lifecycleChange, triageChange } from '../mcp/mapping/change-metadata.js';
import { matchReason, toTaskMcpDto } from '../mcp/mapping/task-mcp-dto.js';
import { CliUsageError, toCliError } from './output/cli-errors.js';
import { cliFailure, cliSuccess } from './output/cli-result.js';

type Writer = { write(text: string): unknown };
export interface CliDependencies {
  readonly createRuntime: () => TaskRuntime;
  readonly stdout: Writer;
  readonly stderr: Writer;
}
type Command = {
  readonly group: 'task' | 'session';
  readonly action: string;
  readonly id?: string;
  readonly options: ReadonlyMap<string, readonly string[]>;
};

export async function runCli(
  argv: readonly string[],
  dependencies: CliDependencies,
): Promise<number> {
  try {
    const command = parse(argv);
    const runtime = dependencies.createRuntime();
    try {
      const result = execute(command, runtime.taskApplication);
      const { warnings = [], ...data } = result;
      write(dependencies.stdout, cliSuccess(data, warnings as readonly unknown[]));
      return 0;
    } catch (error) {
      return writeError(error, dependencies);
    } finally {
      runtime.close();
    }
  } catch (error) {
    return writeError(error, dependencies);
  }
}

function writeError(error: unknown, { stdout, stderr }: CliDependencies): number {
  const mapped = toCliError(error);
  write(stdout, cliFailure(mapped.code, mapped.message));
  stderr.write(`${mapped.message}\n`);
  return mapped.exitCode;
}
function write(writer: Writer, value: unknown): void {
  writer.write(`${JSON.stringify(value)}\n`);
}

function parse(argv: readonly string[]): Command {
  const [group, action, ...rest] = argv;
  if ((group !== 'task' && group !== 'session') || !action)
    throw new CliUsageError('Unknown or missing command.');
  const needsId =
    group === 'task' && ['get', 'edit', 'triage', 'start', 'complete', 'archive'].includes(action);
  const id = needsId ? rest.shift() : undefined;
  if (needsId && (!id || id.startsWith('--'))) throw new CliUsageError('A task id is required.');
  const options = new Map<string, string[]>();
  for (let index = 0; index < rest.length; index += 1) {
    const token = rest[index];
    if (!token?.startsWith('--')) throw new CliUsageError(`Unexpected argument: ${token}`);
    const key = token.slice(2);
    const flags = new Set([
      'clear-description',
      'clear-priority',
      'clear-workspace',
      'clear-source-context',
    ]);
    const value = flags.has(key) ? 'true' : rest[++index];
    if (value === undefined || value.startsWith('--'))
      throw new CliUsageError(`Missing value for --${key}.`);
    const existing = options.get(key) ?? [];
    if (key !== 'status' && existing.length)
      throw new CliUsageError(`Option --${key} may be supplied only once.`);
    options.set(key, [...existing, value]);
  }
  if (option(options, 'output', false) !== 'json')
    throw new CliUsageError('All supported commands require --output json.');
  return { group, action, ...(id === undefined ? {} : { id }), options };
}
function option(
  options: ReadonlyMap<string, readonly string[]>,
  key: string,
  required = false,
): string | undefined {
  const value = options.get(key)?.[0];
  if (required && value === undefined) throw new CliUsageError(`Missing required option --${key}.`);
  return value;
}
function numberOption(
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
function optionalFields(
  command: Command,
): Omit<CreateTaskInput, 'title' | 'creator' | 'sessionId'> {
  const o = command.options;
  const description = option(o, 'description');
  const priority = option(o, 'priority');
  const workspace = option(o, 'workspace');
  const sourceContext = option(o, 'source-context');
  return {
    ...(description === undefined ? {} : { description }),
    ...(priority === undefined ? {} : { priority: priority as TaskPriority }),
    ...(workspace === undefined ? {} : { workspace }),
    ...(sourceContext === undefined ? {} : { sourceContext }),
  };
}
function workspaceOption(options: ReadonlyMap<string, readonly string[]>) {
  const workspace = option(options, 'workspace');
  return workspace === undefined ? {} : { workspace };
}

function execute(command: Command, application: TaskApplication): Record<string, unknown> {
  const o = command.options;
  if (command.group === 'session' && command.action === 'captures') {
    const sessionId = option(o, 'session', true)!;
    const tasks = application.listSessionCaptures({
      sessionId,
      limit: numberOption(o, 'limit', 100, 100),
    });
    return { sessionId, tasks: tasks.map(toTaskMcpDto), count: tasks.length };
  }
  if (command.group !== 'task') throw new CliUsageError('Unknown command.');
  if (command.action === 'get') return { task: toTaskMcpDto(application.get({ id: command.id! })) };
  if (command.action === 'list') {
    const statuses = (o.get('status') ?? [...TASK_STATUSES]) as readonly TaskStatus[];
    const tasks = application.list({
      statuses,
      limit: numberOption(o, 'limit', 100, 100),
      ...workspaceOption(o),
    });
    return { tasks: tasks.map(toTaskMcpDto), count: tasks.length };
  }
  if (command.action === 'find-similar') {
    const title = option(o, 'title', true)!;
    const candidates = application.findSimilar({
      title,
      limit: numberOption(o, 'limit', 5, 5),
      ...workspaceOption(o),
    });
    return {
      candidates: candidates.map((task) => ({
        task: toTaskMcpDto(task),
        matchReason: matchReason(task, title),
      })),
    };
  }
  if (command.action === 'capture') {
    const title = option(o, 'title', true)!;
    const matches = application.findSimilar({ title, limit: 5, ...workspaceOption(o) });
    const task = application.create({
      title,
      ...optionalFields(command),
      sessionId: option(o, 'session', true)!,
      creator: { type: 'AGENT', name: option(o, 'agent', true)! },
    });
    return {
      task: toTaskMcpDto(task),
      change: { action: 'CREATED' },
      warnings: matches.length
        ? [
            {
              code: 'POSSIBLE_DUPLICATE',
              message: 'Similar tasks already exist.',
              candidates: matches.map(({ id }) => ({ id })),
            },
          ]
        : [],
    };
  }
  if (command.action === 'edit') {
    const fields = optionalFields(command);
    const clears = {
      ...(o.has('clear-description') ? { description: null } : {}),
      ...(o.has('clear-priority') ? { priority: null } : {}),
      ...(o.has('clear-workspace') ? { workspace: null } : {}),
      ...(o.has('clear-source-context') ? { sourceContext: null } : {}),
    };
    const title = option(o, 'title');
    if (!Object.keys(fields).length && !Object.keys(clears).length && title === undefined)
      throw new CliUsageError('At least one editable task field is required.');
    const mutation = application.edit({
      id: command.id!,
      ...(title === undefined ? {} : { title }),
      ...fields,
      ...clears,
    } as EditTaskInput);
    return {
      task: toTaskMcpDto(mutation.task),
      change: editChange(mutation.before, mutation.task),
    };
  }
  if (command.action === 'triage') {
    const target = option(o, 'to', true)!;
    const mutation =
      target === 'INBOX'
        ? application.moveToInbox({ id: command.id! })
        : target === 'ACTIVE'
          ? application.activate({ id: command.id! })
          : target === 'BACKLOG'
            ? application.moveToBacklog({ id: command.id! })
            : (() => {
                throw new CliUsageError('--to must be INBOX, ACTIVE, or BACKLOG.');
              })();
    return {
      task: toTaskMcpDto(mutation.task),
      change: triageChange(mutation.before, mutation.task),
    };
  }
  const methods = {
    start: ['start', 'STARTED'],
    complete: ['complete', 'COMPLETED'],
    archive: ['archive', 'ARCHIVED'],
  } as const;
  const method = methods[command.action as keyof typeof methods];
  if (!method) throw new CliUsageError('Unknown command.');
  const mutation = application[method[0]]({ id: command.id! });
  return {
    task: toTaskMcpDto(mutation.task),
    change: lifecycleChange(mutation.before, mutation.task, method[1]),
  };
}
