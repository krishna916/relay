export const TASK_STATUSES = [
  'INBOX',
  'ACTIVE',
  'IN_PROGRESS',
  'BACKLOG',
  'DONE',
  'ARCHIVED',
] as const;

export type TaskStatus = (typeof TASK_STATUSES)[number];

export function isTaskStatus(value: unknown): value is TaskStatus {
  return typeof value === 'string' && TASK_STATUSES.includes(value as TaskStatus);
}
