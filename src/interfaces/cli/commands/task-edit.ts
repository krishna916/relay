import type { TaskApplication } from '../../../application/tasks/task-application.js';
import { editChange } from '../../contracts/change-metadata.js';
import { toTaskDto } from '../../contracts/task-dto.js';
import type { TaskEditCommand } from '../cli-command.js';
import type { CliCommandResult } from './command-result.js';

export function executeTaskEdit(
  command: TaskEditCommand,
  application: TaskApplication,
): CliCommandResult {
  const mutation = application.edit({ id: command.id, ...command.changes });
  return {
    data: { task: toTaskDto(mutation.task), change: editChange(mutation.before, mutation.task) },
  };
}
