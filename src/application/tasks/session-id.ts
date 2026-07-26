import { TaskValidationError } from '../../domain/task/task-errors.js';
import { MAX_SESSION_ID_LENGTH, SESSION_ID_PATTERN } from '../../shared/session-id-rules.js';

export function validateSessionId(value: unknown): string {
  if (typeof value !== 'string')
    throw new TaskValidationError('sessionId', 'sessionId must be a string');
  const sessionId = value.trim();
  if (
    sessionId.length === 0 ||
    sessionId.length > MAX_SESSION_ID_LENGTH ||
    !SESSION_ID_PATTERN.test(sessionId)
  ) {
    throw new TaskValidationError('sessionId', 'sessionId is invalid');
  }
  return sessionId;
}
