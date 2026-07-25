import { createTask, type Task } from '../../../domain/task/task.js';
import type { TaskRepository } from '../task-repository.js';
import { required } from './repository-operations.js';

export interface GetTaskInput {
  readonly id: string;
}
export interface TaskIdInput {
  readonly id: string;
}
export function normalizeTaskId(id: string): string {
  return createTask(
    { id, title: 'id validation', createdByType: 'HUMAN' },
    '2000-01-01T00:00:00.000Z',
  ).id;
}
export function getTaskUseCase(input: GetTaskInput, repository: TaskRepository): Task {
  const id = normalizeTaskId(input.id);
  return required(() => repository.findById(id), id);
}
