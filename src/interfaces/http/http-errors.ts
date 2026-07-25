import { ZodError } from 'zod';
import {
  InvalidTaskRequestError,
  TaskApplicationError,
  TaskNotFoundError,
} from '../../application/tasks/task-application-errors.js';
import {
  TaskDomainError,
  TaskArchivedError,
  TaskTransitionError,
} from '../../domain/task/task-errors.js';

export class HttpError extends Error {
  public constructor(
    public readonly status: number,
    public readonly code: string,
    message: string,
    public readonly details?: Record<string, readonly string[]>,
  ) {
    super(message);
    this.name = 'HttpError';
  }
}

export function invalidRequest(
  message: string,
  details?: Record<string, readonly string[]>,
): HttpError {
  return new HttpError(400, 'INVALID_REQUEST', message, details);
}

export function toHttpError(error: unknown): HttpError {
  if (error instanceof HttpError) return error;
  if (error instanceof ZodError)
    return invalidRequest('Request validation failed.', zodDetails(error));
  if (error instanceof TaskNotFoundError)
    return new HttpError(404, 'TASK_NOT_FOUND', 'Task was not found.');
  if (error instanceof TaskTransitionError || error instanceof TaskArchivedError)
    return new HttpError(409, error.code, error.message);
  if (error instanceof TaskDomainError || error instanceof InvalidTaskRequestError)
    return invalidRequest(error.message);
  if (error instanceof TaskApplicationError)
    return new HttpError(500, 'INTERNAL_ERROR', 'An unexpected internal error occurred.');
  return new HttpError(500, 'INTERNAL_ERROR', 'An unexpected internal error occurred.');
}

function zodDetails(error: ZodError): Record<string, readonly string[]> {
  const details: Record<string, string[]> = {};
  for (const issue of error.issues) {
    const field = issue.path.length === 0 ? 'request' : issue.path.join('.');
    (details[field] ??= []).push(issue.message);
  }
  return details;
}
