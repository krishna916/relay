import {
  activateTask,
  archiveTask,
  completeTask,
  moveTaskToBacklog,
  moveTaskToInbox,
  startTask,
} from '../../domain/task/task-lifecycle.js';
import type { Task } from '../../domain/task/task.js';
import { SystemClock, type Clock } from './clock.js';
import { UuidGenerator, type IdGenerator } from './id-generator.js';
import type { TaskRepository } from './task-repository.js';
import { createTaskUseCase, type CreateTaskInput } from './use-cases/create-task.js';
import {
  editTaskUseCase,
  editTaskWithPreviousUseCase,
  type EditTaskInput,
} from './use-cases/edit-task.js';
import { getTaskUseCase, type GetTaskInput, type TaskIdInput } from './use-cases/get-task.js';
import { listTasksUseCase, type ListTasksInput } from './use-cases/list-tasks.js';
import {
  transitionTaskUseCase,
  transitionTaskWithPreviousUseCase,
} from './use-cases/transition-task.js';
import {
  findSimilarTasksUseCase,
  type FindSimilarTasksInput,
} from './use-cases/find-similar-tasks.js';
import {
  listSessionCapturesUseCase,
  type ListSessionCapturesInput,
} from './use-cases/list-session-captures.js';

export interface TaskApplicationDependencies {
  readonly repository: TaskRepository;
  readonly clock?: Clock;
  readonly idGenerator?: IdGenerator;
}
export interface TaskMutationResult {
  readonly before: Task;
  readonly task: Task;
}
export interface TaskApplication {
  create(input: CreateTaskInput): Task;
  get(input: GetTaskInput): Task;
  list(input: ListTasksInput): readonly Task[];
  edit(input: EditTaskInput): Task;
  moveToInbox(input: TaskIdInput): Task;
  activate(input: TaskIdInput): Task;
  start(input: TaskIdInput): Task;
  moveToBacklog(input: TaskIdInput): Task;
  complete(input: TaskIdInput): Task;
  archive(input: TaskIdInput): Task;
  editWithPrevious(input: EditTaskInput): TaskMutationResult;
  moveToInboxWithPrevious(input: TaskIdInput): TaskMutationResult;
  activateWithPrevious(input: TaskIdInput): TaskMutationResult;
  moveToBacklogWithPrevious(input: TaskIdInput): TaskMutationResult;
  startWithPrevious(input: TaskIdInput): TaskMutationResult;
  completeWithPrevious(input: TaskIdInput): TaskMutationResult;
  archiveWithPrevious(input: TaskIdInput): TaskMutationResult;
  listSessionCaptures(input: ListSessionCapturesInput): readonly Task[];
  findSimilar(input: FindSimilarTasksInput): readonly Task[];
}
export function createTaskApplication(dependencies: TaskApplicationDependencies): TaskApplication {
  const resolvedDependencies = {
    repository: dependencies.repository,
    clock: dependencies.clock ?? new SystemClock(),
    idGenerator: dependencies.idGenerator ?? new UuidGenerator(),
  };
  const transition = (input: TaskIdInput, operation: (task: Task, now: string) => Task) =>
    transitionTaskUseCase(input, resolvedDependencies, operation);
  const transitionWithPrevious = (
    input: TaskIdInput,
    operation: (task: Task, now: string) => Task,
  ): TaskMutationResult =>
    transitionTaskWithPreviousUseCase(input, resolvedDependencies, operation);
  return {
    create: (input) => createTaskUseCase(input, resolvedDependencies),
    get: (input) => getTaskUseCase(input, resolvedDependencies.repository),
    list: (input) => listTasksUseCase(input, resolvedDependencies.repository),
    edit: (input) => editTaskUseCase(input, resolvedDependencies),
    moveToInbox: (input) => transition(input, moveTaskToInbox),
    activate: (input) => transition(input, activateTask),
    start: (input) => transition(input, startTask),
    moveToBacklog: (input) => transition(input, moveTaskToBacklog),
    complete: (input) => transition(input, completeTask),
    archive: (input) => transition(input, archiveTask),
    editWithPrevious: (input) => editTaskWithPreviousUseCase(input, resolvedDependencies),
    moveToInboxWithPrevious: (input) => transitionWithPrevious(input, moveTaskToInbox),
    activateWithPrevious: (input) => transitionWithPrevious(input, activateTask),
    moveToBacklogWithPrevious: (input) => transitionWithPrevious(input, moveTaskToBacklog),
    startWithPrevious: (input) => transitionWithPrevious(input, startTask),
    completeWithPrevious: (input) => transitionWithPrevious(input, completeTask),
    archiveWithPrevious: (input) => transitionWithPrevious(input, archiveTask),
    listSessionCaptures: (input) =>
      listSessionCapturesUseCase(input, resolvedDependencies.repository),
    findSimilar: (input) => findSimilarTasksUseCase(input, resolvedDependencies.repository),
  };
}
export type { CreateTaskInput } from './use-cases/create-task.js';
export type { EditTaskInput } from './use-cases/edit-task.js';
export type { GetTaskInput, TaskIdInput } from './use-cases/get-task.js';
export type { ListTasksInput } from './use-cases/list-tasks.js';
export type { FindSimilarTasksInput } from './use-cases/find-similar-tasks.js';
export type { ListSessionCapturesInput } from './use-cases/list-session-captures.js';
