import type { Task } from '../../../domain/task/task.js';
import { isTaskStatus, type TaskStatus } from '../../../domain/task/task-status.js';
import { InvalidTaskRequestError } from '../task-application-errors.js';
import type { TaskRepository } from '../task-repository.js';
import { persist } from './repository-operations.js';

export interface ListTasksInput {
  readonly statuses: readonly TaskStatus[];
  readonly limit?: number;
}
export function listTasksUseCase(
  input: ListTasksInput,
  repository: TaskRepository,
): readonly Task[] {
  if (input.statuses.length === 0 || input.statuses.some((status) => !isTaskStatus(status)))
    throw new InvalidTaskRequestError('At least one supported task status is required.');
  const limit = input.limit ?? 100;
  if (!Number.isInteger(limit) || limit < 1 || limit > 200)
    throw new InvalidTaskRequestError('Task list limit must be an integer from 1 through 200.');
  const statuses = [...new Set(input.statuses)];
  return persist(() => repository.list({ statuses, limit }), 'Tasks could not be listed.');
}
