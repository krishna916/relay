import type Database from 'better-sqlite3';
import { describe, expect, it, vi } from 'vitest';
import type { TaskRepository } from '../../../../src/application/tasks/task-repository.js';
import {
  createTaskRuntime,
  type TaskRuntimeDependencies,
} from '../../../../src/interfaces/shared/create-task-runtime.js';

function createDependencies(events: string[] = []) {
  const database = { close: vi.fn() } as unknown as Database.Database;
  const dependencies: TaskRuntimeDependencies = {
    createDatabaseConnection: vi.fn(() => {
      events.push('connect');
      return database;
    }),
    runMigrations: vi.fn(() => events.push('migrate')),
    createTaskRepository: vi.fn(() => {
      events.push('repository');
      return {} as TaskRepository;
    }),
    createTaskApplication: vi.fn(() => {
      events.push('application');
      return {} as ReturnType<TaskRuntimeDependencies['createTaskApplication']>;
    }),
  };
  return { database, dependencies };
}

describe('createTaskRuntime', () => {
  it('runs migrations before composing the repository and application', () => {
    const events: string[] = [];
    const { dependencies } = createDependencies(events);

    const runtime = createTaskRuntime({}, dependencies);

    expect(events).toEqual(['connect', 'migrate', 'repository', 'application']);
    expect(Object.keys(runtime).sort()).toEqual(['close', 'taskApplication']);
  });

  it('closes the database exactly once when close is called repeatedly', () => {
    const { database, dependencies } = createDependencies();
    const runtime = createTaskRuntime({}, dependencies);

    runtime.close();
    runtime.close();

    expect(database.close).toHaveBeenCalledTimes(1);
  });

  it('closes an opened database when startup fails', () => {
    const { database, dependencies } = createDependencies();
    const failingDependencies = {
      ...dependencies,
      runMigrations: vi.fn(() => {
        throw new Error('migration failed');
      }),
    };

    expect(() => createTaskRuntime({}, failingDependencies)).toThrow('migration failed');
    expect(database.close).toHaveBeenCalledTimes(1);
  });

  it.each([
    [
      'repository',
      (dependencies: TaskRuntimeDependencies) => ({
        ...dependencies,
        createTaskRepository: vi.fn(() => {
          throw new Error('repository failed');
        }),
      }),
    ],
    [
      'application',
      (dependencies: TaskRuntimeDependencies) => ({
        ...dependencies,
        createTaskApplication: vi.fn(() => {
          throw new Error('application failed');
        }),
      }),
    ],
  ])('closes an opened database when %s creation fails', (_stage, makeFailingDependencies) => {
    const { database, dependencies } = createDependencies();

    expect(() => createTaskRuntime({}, makeFailingDependencies(dependencies))).toThrow(
      `${_stage} failed`,
    );
    expect(database.close).toHaveBeenCalledTimes(1);
  });
});
