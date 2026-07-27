import type { TaskApplication } from '../../../application/tasks/task-application.js';
import { toTaskDto } from '../../contracts/task-dto.js';
import type { TaskListCommand } from '../cli-command.js';
import type { CliCommandResult } from './command-result.js';

export function executeTaskList(
  command: TaskListCommand,
  application: TaskApplication,
): CliCommandResult {
  const tasks = application.list({
    statuses: command.statuses,
    limit: command.limit,
    ...(command.workspace === undefined ? {} : { workspace: command.workspace }),
  });
  return { data: { tasks: tasks.map(toTaskDto), count: tasks.length } };
}
