import type { TaskApplication } from '../../../application/tasks/task-application.js';
import { toTaskDto } from '../../contracts/task-dto.js';
import type { SessionCapturesCommand } from '../cli-command.js';
import type { CliCommandResult } from './command-result.js';

export function executeSessionCaptures(
  command: SessionCapturesCommand,
  application: TaskApplication,
): CliCommandResult {
  const tasks = application.listSessionCaptures({
    sessionId: command.sessionId,
    limit: command.limit,
  });
  return {
    data: { sessionId: command.sessionId, tasks: tasks.map(toTaskDto), count: tasks.length },
  };
}
