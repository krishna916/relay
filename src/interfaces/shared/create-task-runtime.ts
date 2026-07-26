import type Database from 'better-sqlite3';
import {
  createTaskApplication,
  type TaskApplication,
} from '../../application/tasks/task-application.js';
import type { TaskRepository } from '../../application/tasks/task-repository.js';
import { createDatabaseConnection } from '../../database/connection.js';
import { runMigrations } from '../../database/migrate.js';
import { SqliteTaskRepository } from '../../database/tasks/sqlite-task-repository.js';

export interface TaskRuntime {
  readonly taskApplication: TaskApplication;
  readonly close: () => void;
}
export interface TaskRuntimeDependencies {
  readonly createDatabaseConnection: typeof createDatabaseConnection;
  readonly runMigrations: typeof runMigrations;
  readonly createTaskApplication: typeof createTaskApplication;
  readonly createTaskRepository: (database: Database.Database) => TaskRepository;
}

const defaultDependencies: TaskRuntimeDependencies = {
  createDatabaseConnection,
  runMigrations,
  createTaskApplication,
  createTaskRepository: (database) => new SqliteTaskRepository(database),
};

export function createTaskRuntime(
  options: { readonly databasePath?: string } = {},
  dependencies: TaskRuntimeDependencies = defaultDependencies,
): TaskRuntime {
  let database: Database.Database | null = null;
  try {
    database = dependencies.createDatabaseConnection(
      options.databasePath === undefined ? {} : { path: options.databasePath },
    );
    dependencies.runMigrations(database);
    return {
      taskApplication: dependencies.createTaskApplication({
        repository: dependencies.createTaskRepository(database),
      }),
      close: closeOnce(database),
    };
  } catch (error) {
    database?.close();
    throw error;
  }
}
function closeOnce(database: Database.Database): () => void {
  let closed = false;
  return () => {
    if (!closed) {
      closed = true;
      database.close();
    }
  };
}
