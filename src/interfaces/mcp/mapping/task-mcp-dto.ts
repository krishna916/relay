import type { Task } from '../../../domain/task/task.js';
import type { TaskDto } from '../../http/task-dto.js';

export function toTaskMcpDto(task: Task): TaskDto {
  return { ...task };
}
export function matchReason(task: Task, title: string): 'EXACT_TITLE' | 'NORMALIZED_TITLE' {
  return task.title === title.trim() ? 'EXACT_TITLE' : 'NORMALIZED_TITLE';
}
