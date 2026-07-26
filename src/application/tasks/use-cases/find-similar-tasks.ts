import { InvalidTaskRequestError } from '../task-application-errors.js';
import type { TaskRepository } from '../task-repository.js';
import { normalizeTaskTitle } from '../title-normalization.js';

export interface FindSimilarTasksInput {
  readonly title: string;
  readonly workspace?: string | null;
  readonly limit?: number;
}
export function findSimilarTasksUseCase(input: FindSimilarTasksInput, repository: TaskRepository) {
  const limit = input.limit ?? 5;
  if (!Number.isInteger(limit) || limit < 1 || limit > 5)
    throw new InvalidTaskRequestError('limit must be an integer from 1 through 5.');
  if (typeof input.title !== 'string' || normalizeTaskTitle(input.title) === '')
    throw new InvalidTaskRequestError('title is required.');
  if (
    input.workspace !== undefined &&
    input.workspace !== null &&
    typeof input.workspace !== 'string'
  )
    throw new InvalidTaskRequestError('workspace must be a string or null.');
  return repository.findSimilar({
    normalizedTitle: normalizeTaskTitle(input.title),
    workspace: input.workspace?.trim() || null,
    limit,
  });
}
