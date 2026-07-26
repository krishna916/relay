import {
  rehydrateTask,
  type RehydrateTaskInput,
  type Task,
  type TaskCreatorType,
} from '../../domain/task/task.js';
import type { TaskPriority } from '../../domain/task/task-priority.js';
import type { TaskStatus } from '../../domain/task/task-status.js';
import { TaskRepositoryCorruptionError } from '../../application/tasks/task-repository-errors.js';

export const TASK_COLUMN_LIST = `
  id,
  title,
  description,
  status,
  priority,
  workspace,
  source_context,
  created_by_type,
  created_by_name,
  session_id,
  created_at,
  updated_at,
  started_at,
  completed_at,
  archived_at
`;

export interface TaskRow {
  readonly id: string;
  readonly title: string;
  readonly description: string | null;
  readonly status: TaskStatus;
  readonly priority: TaskPriority | null;
  readonly workspace: string | null;
  readonly source_context: string | null;
  readonly created_by_type: TaskCreatorType;
  readonly created_by_name: string | null;
  readonly session_id: string | null;
  readonly created_at: string;
  readonly updated_at: string;
  readonly started_at: string | null;
  readonly completed_at: string | null;
  readonly archived_at: string | null;
}

export type TaskParameters = TaskRow;
export type TaskUpdateParameters = Omit<
  TaskParameters,
  'created_at' | 'created_by_name' | 'created_by_type' | 'session_id'
>;

export function taskToParameters(task: Task): TaskParameters {
  return {
    id: task.id,
    title: task.title,
    description: task.description,
    status: task.status,
    priority: task.priority,
    workspace: task.workspace,
    source_context: task.sourceContext,
    created_by_type: task.createdByType,
    created_by_name: task.createdByName,
    session_id: task.sessionId,
    created_at: task.createdAt,
    updated_at: task.updatedAt,
    started_at: task.startedAt,
    completed_at: task.completedAt,
    archived_at: task.archivedAt,
  };
}

export function taskToUpdateParameters(task: Task): TaskUpdateParameters {
  return {
    id: task.id,
    title: task.title,
    description: task.description,
    status: task.status,
    priority: task.priority,
    workspace: task.workspace,
    source_context: task.sourceContext,
    updated_at: task.updatedAt,
    started_at: task.startedAt,
    completed_at: task.completedAt,
    archived_at: task.archivedAt,
  };
}

export function taskRowToDomain(row: TaskRow): Task {
  const input: RehydrateTaskInput = {
    id: row.id,
    title: row.title,
    description: row.description,
    status: row.status,
    priority: row.priority,
    workspace: row.workspace,
    sourceContext: row.source_context,
    createdByType: row.created_by_type,
    createdByName: row.created_by_name,
    sessionId: row.session_id,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
    startedAt: row.started_at,
    completedAt: row.completed_at,
    archivedAt: row.archived_at,
  };

  try {
    return rehydrateTask(input);
  } catch (error) {
    throw new TaskRepositoryCorruptionError('Stored task data is invalid.', { cause: error });
  }
}
