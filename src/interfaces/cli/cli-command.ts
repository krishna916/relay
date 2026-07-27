import type { EditTaskInput } from '../../application/tasks/task-application.js';
import type { TaskPriority } from '../../domain/task/task-priority.js';
import type { TaskStatus } from '../../domain/task/task-status.js';

export interface TaskCaptureCommand {
  readonly kind: 'task.capture';
  readonly title: string;
  readonly description?: string;
  readonly priority?: TaskPriority;
  readonly workspace?: string;
  readonly sourceContext?: string;
  readonly agent: string;
  readonly sessionId: string;
}

export interface TaskListCommand {
  readonly kind: 'task.list';
  readonly statuses: readonly TaskStatus[];
  readonly workspace?: string;
  readonly limit: number;
}

export interface TaskGetCommand {
  readonly kind: 'task.get';
  readonly id: string;
}

export interface TaskFindSimilarCommand {
  readonly kind: 'task.find-similar';
  readonly title: string;
  readonly workspace?: string;
  readonly limit: number;
}

export interface TaskEditCommand {
  readonly kind: 'task.edit';
  readonly id: string;
  readonly changes: Omit<EditTaskInput, 'id'>;
}

export interface TaskTriageCommand {
  readonly kind: 'task.triage';
  readonly id: string;
  readonly target: 'INBOX' | 'ACTIVE' | 'BACKLOG';
}

export interface TaskLifecycleCommand {
  readonly kind: 'task.start' | 'task.complete' | 'task.archive';
  readonly id: string;
  readonly action: 'start' | 'complete' | 'archive';
}

export interface SessionCapturesCommand {
  readonly kind: 'session.captures';
  readonly sessionId: string;
  readonly limit: number;
}

export type CliCommand =
  | TaskCaptureCommand
  | TaskListCommand
  | TaskGetCommand
  | TaskFindSimilarCommand
  | TaskEditCommand
  | TaskTriageCommand
  | TaskLifecycleCommand
  | SessionCapturesCommand;
