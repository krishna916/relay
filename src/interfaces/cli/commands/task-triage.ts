import type { TaskApplication } from '../../../application/tasks/task-application.js';
import { triageChange } from '../../contracts/change-metadata.js';
import { toTaskDto } from '../../contracts/task-dto.js';
import type { TaskTriageCommand } from '../cli-command.js';
import type { CliCommandResult } from './command-result.js';

export function executeTaskTriage(
  command: TaskTriageCommand,
  application: TaskApplication,
): CliCommandResult {
  const mutation =
    command.target === 'INBOX'
      ? application.moveToInbox({ id: command.id })
      : command.target === 'ACTIVE'
        ? application.activate({ id: command.id })
        : application.moveToBacklog({ id: command.id });
  return {
    data: { task: toTaskDto(mutation.task), change: triageChange(mutation.before, mutation.task) },
  };
}
