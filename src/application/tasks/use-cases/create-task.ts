import { createTask, type Task, type TaskCreatorType } from '../../../domain/task/task.js';
import type { TaskPriority } from '../../../domain/task/task-priority.js';
import type { Clock } from '../clock.js';
import type { IdGenerator } from '../id-generator.js';
import { persist } from './repository-operations.js';
import type { TaskRepository } from '../task-repository.js';

export interface TaskCreatorInput {
  readonly type: TaskCreatorType;
  readonly name?: string | null;
}
export interface CreateTaskInput {
  readonly title: string;
  readonly description?: string | null;
  readonly priority?: TaskPriority | null;
  readonly workspace?: string | null;
  readonly sourceContext?: string | null;
  readonly sessionId?: string | null;
  readonly creator: TaskCreatorInput;
}

export function createTaskUseCase(
  input: CreateTaskInput,
  dependencies: {
    readonly repository: TaskRepository;
    readonly clock: Clock;
    readonly idGenerator: IdGenerator;
  },
): Task {
  const id = dependencies.idGenerator.generate();
  const now = dependencies.clock.now().toISOString();
  const task = createTask(
    {
      id,
      title: input.title,
      ...(input.description === undefined ? {} : { description: input.description }),
      ...(input.priority === undefined ? {} : { priority: input.priority }),
      ...(input.workspace === undefined ? {} : { workspace: input.workspace }),
      ...(input.sourceContext === undefined ? {} : { sourceContext: input.sourceContext }),
      ...(input.sessionId === undefined ? {} : { sessionId: input.sessionId }),
      createdByType: input.creator.type,
      ...(input.creator.name === undefined ? {} : { createdByName: input.creator.name }),
    },
    now,
  );
  return persist(() => dependencies.repository.create(task), 'Task could not be created.');
}
