import type { Task } from '../../../domain/task/task.js';
import type { Clock } from '../clock.js';
import type { TaskRepository } from '../task-repository.js';
import { normalizeTaskId, type TaskIdInput } from './get-task.js';
import { persist, required } from './repository-operations.js';

export type TaskTransition = (task: Task, now: string) => Task;
export function transitionTaskUseCase(
  input: TaskIdInput,
  dependencies: { readonly repository: TaskRepository; readonly clock: Clock },
  transition: TaskTransition,
): Task {
  const id = normalizeTaskId(input.id);
  const existing = required(() => dependencies.repository.findById(id), id);
  const updated = transition(existing, dependencies.clock.now().toISOString());
  return updated === existing
    ? existing
    : persist(() => dependencies.repository.update(updated), `Task ${id} could not be updated.`);
}
