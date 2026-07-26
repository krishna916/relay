import type { Task } from '../../domain/task/task.js';
import type { TaskStatus } from '../../domain/task/task-status.js';

export interface TaskListQuery {
  readonly statuses: readonly TaskStatus[];
  readonly limit: number;
}
export interface SessionCaptureQuery {
  readonly sessionId: string;
  readonly limit: number;
}
export interface SimilarTaskQuery {
  readonly normalizedTitle: string;
  readonly workspace: string | null;
  readonly limit: number;
}

export interface TaskRepository {
  create(task: Task): Task;
  findById(id: string): Task | null;
  update(task: Task): Task;
  list(query: TaskListQuery): readonly Task[];
  listSessionCaptures(query: SessionCaptureQuery): readonly Task[];
  findSimilar(query: SimilarTaskQuery): readonly Task[];
}
