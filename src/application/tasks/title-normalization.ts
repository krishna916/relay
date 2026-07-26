import { normalizeTaskTitleV1 } from '../../database/migrations/functions/normalize-task-title-v1.js';

export function normalizeTaskTitle(value: string): string {
  return normalizeTaskTitleV1(value);
}
