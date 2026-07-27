import type { TaskApplication } from '../../../application/tasks/task-application.js';
import { toTaskDto } from '../../contracts/task-dto.js';
import type { TaskGetCommand } from '../cli-command.js';
import type { CliCommandResult } from './command-result.js';

export function executeTaskGet(
  command: TaskGetCommand,
  application: TaskApplication,
): CliCommandResult {
  return { data: { task: toTaskDto(application.get({ id: command.id })) } };
}
