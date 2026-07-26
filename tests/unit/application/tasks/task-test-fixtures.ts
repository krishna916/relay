import type {
  TaskListQuery,
  TaskRepository,
} from '../../../../src/application/tasks/task-repository.js';
import type { Task } from '../../../../src/domain/task/task.js';

export class FixedClock {
  public calls = 0;

  public constructor(private readonly value: Date) {}

  public now(): Date {
    this.calls += 1;
    return this.value;
  }
}

export class FixedIdGenerator {
  public calls = 0;

  public constructor(private readonly value = 'generated-task-id') {}

  public generate(): string {
    this.calls += 1;
    return this.value;
  }
}

export class InMemoryTaskRepository implements TaskRepository {
  public readonly tasks = new Map<string, Task>();
  public createCalls = 0;
  public findCalls = 0;
  public updateCalls = 0;
  public listCalls = 0;
  public lastListQuery: TaskListQuery | null = null;
  public createFailure: Error | null = null;
  public findFailure: Error | null = null;
  public updateFailure: Error | null = null;
  public listFailure: Error | null = null;
  public lastSessionCaptureQuery: { readonly sessionId: string; readonly limit: number } | null =
    null;
  public lastSimilarQuery: {
    readonly normalizedTitle: string;
    readonly workspace: string | null;
    readonly limit: number;
  } | null = null;

  public create(task: Task): Task {
    this.createCalls += 1;
    if (this.createFailure !== null) throw this.createFailure;
    this.tasks.set(task.id, task);
    return task;
  }

  public findById(id: string): Task | null {
    this.findCalls += 1;
    if (this.findFailure !== null) throw this.findFailure;
    return this.tasks.get(id) ?? null;
  }

  public update(task: Task): Task {
    this.updateCalls += 1;
    if (this.updateFailure !== null) throw this.updateFailure;
    this.tasks.set(task.id, task);
    return task;
  }

  public list(query: TaskListQuery): readonly Task[] {
    this.listCalls += 1;
    this.lastListQuery = query;
    if (this.listFailure !== null) throw this.listFailure;
    return [...this.tasks.values()]
      .filter((task) => query.statuses.includes(task.status))
      .slice(0, query.limit);
  }

  public listSessionCaptures(query: {
    readonly sessionId: string;
    readonly limit: number;
  }): readonly Task[] {
    this.lastSessionCaptureQuery = query;
    return [...this.tasks.values()]
      .filter((task) => task.createdByType === 'AGENT' && task.sessionId === query.sessionId)
      .slice(0, query.limit);
  }

  public findSimilar(query: {
    readonly normalizedTitle: string;
    readonly workspace: string | null;
    readonly limit: number;
  }): readonly Task[] {
    this.lastSimilarQuery = query;
    return [...this.tasks.values()].slice(0, query.limit);
  }
}
