import type { TaskApplication } from '../../application/tasks/task-application.js';
import type { CliCommand } from './cli-command.js';
import { executeSessionCaptures } from './commands/session-captures.js';
import type { CliCommandResult } from './commands/command-result.js';
import { executeTaskCapture } from './commands/task-capture.js';
import { executeTaskEdit } from './commands/task-edit.js';
import { executeTaskFindSimilar } from './commands/task-find-similar.js';
import { executeTaskGet } from './commands/task-get.js';
import { executeTaskLifecycle } from './commands/task-lifecycle.js';
import { executeTaskList } from './commands/task-list.js';
import { executeTaskTriage } from './commands/task-triage.js';

export function executeCliCommand(
  command: CliCommand,
  application: TaskApplication,
): CliCommandResult {
  switch (command.kind) {
    case 'task.capture':
      return executeTaskCapture(command, application);
    case 'task.list':
      return executeTaskList(command, application);
    case 'task.get':
      return executeTaskGet(command, application);
    case 'task.find-similar':
      return executeTaskFindSimilar(command, application);
    case 'task.edit':
      return executeTaskEdit(command, application);
    case 'task.triage':
      return executeTaskTriage(command, application);
    case 'task.start':
    case 'task.complete':
    case 'task.archive':
      return executeTaskLifecycle(command, application);
    case 'session.captures':
      return executeSessionCaptures(command, application);
  }
}
