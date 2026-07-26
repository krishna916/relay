import { InvalidTaskRequestError } from '../task-application-errors.js';
import type { TaskRepository } from '../task-repository.js';
import { validateSessionId } from '../session-id.js';

export interface ListSessionCapturesInput {
  readonly sessionId: string;
  readonly limit?: number;
}
export function listSessionCapturesUseCase(
  input: ListSessionCapturesInput,
  repository: TaskRepository,
) {
  const limit = input.limit ?? 100;
  if (!Number.isInteger(limit) || limit < 1 || limit > 100)
    throw new InvalidTaskRequestError('limit must be an integer from 1 through 100.');
  return repository.listSessionCaptures({ sessionId: validateSessionId(input.sessionId), limit });
}
