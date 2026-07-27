import type { TaskApplication } from '../../../application/tasks/task-application.js';
import { lifecycleChange } from '../../contracts/change-metadata.js';
import { toTaskDto } from '../../contracts/task-dto.js';
import type { TaskLifecycleCommand } from '../cli-command.js';
import type { CliCommandResult } from './command-result.js';

const ACTIONS = {
  start: ['start', 'STARTED'],
  complete: ['complete', 'COMPLETED'],
  archive: ['archive', 'ARCHIVED'],
} as const;

export function executeTaskLifecycle(
  command: TaskLifecycleCommand,
  application: TaskApplication,
): CliCommandResult {
  const [method, change] = ACTIONS[command.action];
  const mutation = application[method]({ id: command.id });
  return {
    data: {
      task: toTaskDto(mutation.task),
      change: lifecycleChange(mutation.before, mutation.task, change),
    },
  };
}
