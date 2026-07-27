import type { Task } from '../../domain/task/task.js';

const EDITABLE_FIELDS = ['title', 'description', 'priority', 'workspace', 'sourceContext'] as const;

export function editChange(before: Task, after: Task) {
  const fields = EDITABLE_FIELDS.filter((field) => before[field] !== after[field]);
  return { action: fields.length === 0 ? ('NO_CHANGE' as const) : ('EDITED' as const), fields };
}

export function triageChange(before: Task, after: Task) {
  return {
    action: before.status === after.status ? ('NO_CHANGE' as const) : ('TRIAGED' as const),
    from: before.status,
    to: after.status,
  };
}

export function lifecycleChange<Action extends 'STARTED' | 'COMPLETED' | 'ARCHIVED'>(
  before: Task,
  after: Task,
  action: Action,
) {
  return { action: before.status === after.status ? ('NO_CHANGE' as const) : action };
}
