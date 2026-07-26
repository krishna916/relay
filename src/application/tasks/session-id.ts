import { TaskValidationError } from '../../domain/task/task-errors.js';

const PATTERN = /^[A-Za-z0-9._:-]+$/;

export function validateSessionId(value: unknown): string {
  if (typeof value !== 'string')
    throw new TaskValidationError('sessionId', 'sessionId must be a string');
  const sessionId = value.trim();
  if (sessionId.length === 0 || sessionId.length > 128 || !PATTERN.test(sessionId)) {
    throw new TaskValidationError('sessionId', 'sessionId is invalid');
  }
  return sessionId;
}
