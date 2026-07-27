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
import { mcpError } from './mcp-result.js';

export function toMcpError(error: unknown) {
  if (error instanceof TaskArchivedError) return mcpError('ARCHIVED_TASK', 'The task is archived.');
  if (error instanceof TaskTransitionError)
    return mcpError('CONFLICT', 'Task lifecycle transition is not allowed.');
  if (
    error instanceof ZodError ||
    error instanceof InvalidTaskRequestError ||
    error instanceof TaskDomainError
  )
    return mcpError('VALIDATION_ERROR', 'Request validation failed.');
  if (error instanceof TaskNotFoundError) return mcpError('NOT_FOUND', 'Task was not found.');
  if (error instanceof TaskPersistenceError)
    return mcpError('STORAGE_ERROR', 'Task storage operation failed.');
  return mcpError('INTERNAL_ERROR', 'An unexpected internal error occurred.');
}
