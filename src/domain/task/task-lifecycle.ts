import { TaskArchivedError, TaskTransitionError } from './task-errors.js';
import { validateTaskTimestamp, type Task } from './task.js';
import type { TaskStatus } from './task-status.js';

const ALLOWED_TARGETS: Readonly<Record<TaskStatus, readonly TaskStatus[]>> = {
  INBOX: ['ACTIVE', 'BACKLOG', 'ARCHIVED'],
  ACTIVE: ['INBOX', 'IN_PROGRESS', 'BACKLOG', 'DONE', 'ARCHIVED'],
  IN_PROGRESS: ['ACTIVE', 'BACKLOG', 'DONE', 'ARCHIVED'],
  BACKLOG: ['INBOX', 'ACTIVE', 'ARCHIVED'],
  DONE: ['ARCHIVED'],
  ARCHIVED: [],
};

export function moveTaskToInbox(task: Task, now: string): Task {
  return transition(task, 'INBOX', now);
}
export function activateTask(task: Task, now: string): Task {
  return transition(task, 'ACTIVE', now);
}
export function startTask(task: Task, now: string): Task {
  return transition(task, 'IN_PROGRESS', now);
}
export function moveTaskToBacklog(task: Task, now: string): Task {
  return transition(task, 'BACKLOG', now);
}
export function completeTask(task: Task, now: string): Task {
  return transition(task, 'DONE', now);
}
export function archiveTask(task: Task, now: string): Task {
  return transition(task, 'ARCHIVED', now);
}

function transition(task: Task, target: TaskStatus, now: string): Task {
  const timestamp = validateTaskTimestamp(now, 'now');
  if (task.status === target) return task;
  if (task.status === 'ARCHIVED')
    throw new TaskArchivedError('An archived task cannot be transitioned');
  if (!ALLOWED_TARGETS[task.status].includes(target)) {
    throw new TaskTransitionError(`Cannot transition a ${task.status} task to ${target}`);
  }
  return {
    ...task,
    status: target,
    updatedAt: timestamp,
    startedAt: target === 'IN_PROGRESS' ? (task.startedAt ?? timestamp) : task.startedAt,
    completedAt: target === 'DONE' ? timestamp : task.completedAt,
    archivedAt: target === 'ARCHIVED' ? timestamp : task.archivedAt,
  };
}
