import { editTask, type Task, type TaskChanges } from '../../../domain/task/task.js';
import type { TaskPriority } from '../../../domain/task/task-priority.js';
import type { Clock } from '../clock.js';
import { InvalidTaskRequestError } from '../task-application-errors.js';
import type { TaskRepository } from '../task-repository.js';
import { normalizeTaskId } from './get-task.js';
import { persist, required } from './repository-operations.js';

export interface EditTaskInput {
  readonly id: string;
  readonly title?: string;
  readonly description?: string | null;
  readonly priority?: TaskPriority | null;
  readonly workspace?: string | null;
  readonly sourceContext?: string | null;
}
export interface EditTaskResult {
  readonly before: Task;
  readonly task: Task;
}
export function editTaskUseCase(
  input: EditTaskInput,
  dependencies: { readonly repository: TaskRepository; readonly clock: Clock },
): EditTaskResult {
  const changes: TaskChanges = {
    ...(input.title === undefined ? {} : { title: input.title }),
    ...(input.description === undefined ? {} : { description: input.description }),
    ...(input.priority === undefined ? {} : { priority: input.priority }),
    ...(input.workspace === undefined ? {} : { workspace: input.workspace }),
    ...(input.sourceContext === undefined ? {} : { sourceContext: input.sourceContext }),
  };
  if (Object.values(changes).every((value) => value === undefined))
    throw new InvalidTaskRequestError('At least one editable task field is required.');
  const id = normalizeTaskId(input.id);
  const existing = required(() => dependencies.repository.findById(id), id);
  const updated = editTask(existing, changes, dependencies.clock.now().toISOString());
  return {
    before: existing,
    task:
      updated === existing
        ? existing
        : persist(
            () => dependencies.repository.update(updated),
            `Task ${id} could not be updated.`,
          ),
  };
}
