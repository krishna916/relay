import type { TaskApplication } from '../../../application/tasks/task-application.js';
import { matchReason, toTaskDto } from '../../contracts/task-dto.js';
import type { TaskFindSimilarCommand } from '../cli-command.js';
import type { CliCommandResult } from './command-result.js';

export function executeTaskFindSimilar(
  command: TaskFindSimilarCommand,
  application: TaskApplication,
): CliCommandResult {
  const candidates = application.findSimilar({
    title: command.title,
    limit: command.limit,
    ...(command.workspace === undefined ? {} : { workspace: command.workspace }),
  });
  return {
    data: {
      candidates: candidates.map((task) => ({
        task: toTaskDto(task),
        matchReason: matchReason(task, command.title),
      })),
    },
  };
}
