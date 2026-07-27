import type { TaskApplication } from '../../../application/tasks/task-application.js';
import { toTaskDto } from '../../contracts/task-dto.js';
import type { TaskCaptureCommand } from '../cli-command.js';
import type { CliCommandResult } from './command-result.js';

export function executeTaskCapture(
  command: TaskCaptureCommand,
  application: TaskApplication,
): CliCommandResult {
  const matches = application.findSimilar({
    title: command.title,
    ...(command.workspace === undefined ? {} : { workspace: command.workspace }),
    limit: 5,
  });
  const task = application.create({
    title: command.title,
    ...(command.description === undefined ? {} : { description: command.description }),
    ...(command.priority === undefined ? {} : { priority: command.priority }),
    ...(command.workspace === undefined ? {} : { workspace: command.workspace }),
    ...(command.sourceContext === undefined ? {} : { sourceContext: command.sourceContext }),
    sessionId: command.sessionId,
    creator: { type: 'AGENT', name: command.agent },
  });
  const warnings = matches.length
    ? [
        {
          code: 'POSSIBLE_DUPLICATE',
          message: 'Similar tasks already exist.',
          candidates: matches.map(({ id }) => ({ id })),
        },
      ]
    : [];
  return {
    data: { task: toTaskDto(task), change: { action: 'CREATED' } },
    warnings,
  };
}
