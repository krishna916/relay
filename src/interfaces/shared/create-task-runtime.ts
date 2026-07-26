import type Database from 'better-sqlite3';
import {
  createTaskApplication,
  type TaskApplication,
} from '../../application/tasks/task-application.js';
import { createDatabaseConnection } from '../../database/connection.js';
import { runMigrations } from '../../database/migrate.js';
import { SqliteTaskRepository } from '../../database/tasks/sqlite-task-repository.js';

export interface TaskRuntime {
  readonly taskApplication: TaskApplication;
  readonly close: () => void;
}
export function createTaskRuntime(options: { readonly databasePath?: string } = {}): TaskRuntime {
  let database: Database.Database | null = null;
  try {
    database = createDatabaseConnection(
      options.databasePath === undefined ? {} : { path: options.databasePath },
    );
    runMigrations(database);
    return {
      taskApplication: createTaskApplication({ repository: new SqliteTaskRepository(database) }),
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
