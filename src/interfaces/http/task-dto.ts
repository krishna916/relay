import type { Task } from '../../domain/task/task.js';

export interface TaskDto {
  readonly id: string;
  readonly title: string;
  readonly description: string | null;
  readonly status: Task['status'];
  readonly priority: Task['priority'];
  readonly workspace: string | null;
  readonly sourceContext: string | null;
  readonly createdByType: Task['createdByType'];
  readonly createdByName: string | null;
  readonly createdAt: string;
  readonly updatedAt: string;
  readonly startedAt: string | null;
  readonly completedAt: string | null;
  readonly archivedAt: string | null;
}

export function toTaskDto(task: Task): TaskDto {
  return { ...task };
}
