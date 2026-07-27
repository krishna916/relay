import { ZodError } from 'zod';
import {
  InvalidTaskRequestError,
  TaskNotFoundError,
  TaskPersistenceError,
} from '../../../application/tasks/task-application-errors.js';
import {
  TaskArchivedError,
  TaskDomainError,
  TaskTransitionError,
} from '../../../domain/task/task-errors.js';

export interface CliMappedError {
  readonly code: string;
  readonly message: string;
  readonly exitCode: number;
}
export class CliUsageError extends Error {}

export function toCliError(error: unknown): CliMappedError {
  if (error instanceof TaskArchivedError)
    return { code: 'ARCHIVED_TASK', message: 'The task is archived.', exitCode: 4 };
  if (error instanceof TaskTransitionError)
    return { code: 'CONFLICT', message: 'Task lifecycle transition is not allowed.', exitCode: 4 };
  if (error instanceof TaskNotFoundError)
    return { code: 'NOT_FOUND', message: 'Task was not found.', exitCode: 3 };
  if (error instanceof TaskPersistenceError)
    return { code: 'STORAGE_ERROR', message: 'Task storage operation failed.', exitCode: 5 };
  if (
    error instanceof CliUsageError ||
    error instanceof ZodError ||
    error instanceof InvalidTaskRequestError ||
    error instanceof TaskDomainError
  )
    return {
      code: 'VALIDATION_ERROR',
      message: error instanceof CliUsageError ? error.message : 'Request validation failed.',
      exitCode: 2,
    };
  return { code: 'INTERNAL_ERROR', message: 'An unexpected internal error occurred.', exitCode: 1 };
}
