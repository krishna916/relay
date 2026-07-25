import type Database from 'better-sqlite3';
import {
  TaskRepositoryConflictError,
  TaskRepositoryError,
  TaskRepositoryNotFoundError,
} from '../../application/tasks/task-repository-errors.js';
import type { TaskListQuery, TaskRepository } from '../../application/tasks/task-repository.js';
import type { Task } from '../../domain/task/task.js';
import { isTaskStatus } from '../../domain/task/task-status.js';
import {
  TASK_COLUMN_LIST,
  taskRowToDomain,
  taskToParameters,
  taskToUpdateParameters,
  type TaskParameters,
  type TaskRow,
  type TaskUpdateParameters,
} from './task-row.js';

export class SqliteTaskRepository implements TaskRepository {
  private readonly insertStatement: Database.Statement<TaskParameters>;
  private readonly findStatement: Database.Statement<[string], TaskRow>;
  private readonly updateStatement: Database.Statement<TaskUpdateParameters>;
  private readonly listStatements = new Map<number, Database.Statement<unknown[], TaskRow>>();

  public constructor(private readonly db: Database.Database) {
    this.insertStatement = db.prepare<TaskParameters>(`
      INSERT INTO tasks (
        id,
        title,
        description,
        status,
        priority,
        workspace,
        source_context,
        created_by_type,
        created_by_name,
        created_at,
        updated_at,
        started_at,
        completed_at,
        archived_at
      ) VALUES (
        @id,
        @title,
        @description,
        @status,
        @priority,
        @workspace,
        @source_context,
        @created_by_type,
        @created_by_name,
        @created_at,
        @updated_at,
        @started_at,
        @completed_at,
        @archived_at
      )
    `);
    this.findStatement = db.prepare<[string], TaskRow>(`
      SELECT ${TASK_COLUMN_LIST}
      FROM tasks
      WHERE id = ?
    `);
    this.updateStatement = db.prepare<TaskUpdateParameters>(`
      UPDATE tasks
      SET
        title = @title,
        description = @description,
        status = @status,
        priority = @priority,
        workspace = @workspace,
        source_context = @source_context,
        updated_at = @updated_at,
        started_at = @started_at,
        completed_at = @completed_at,
        archived_at = @archived_at
      WHERE id = @id
    `);
  }

  public create(task: Task): Task {
    try {
      this.insertStatement.run(taskToParameters(task));
      return task;
    } catch (error) {
      if (isSqliteConstraintError(error)) {
        throw new TaskRepositoryConflictError('Task could not be created because it conflicts.', {
          cause: error,
        });
      }
      throw new TaskRepositoryError('Task could not be created.', { cause: error });
    }
  }

  public findById(id: string): Task | null {
    let row: TaskRow | undefined;
    try {
      row = this.findStatement.get(id);
    } catch (error) {
      throw new TaskRepositoryError('Task could not be read.', { cause: error });
    }

    return row === undefined ? null : taskRowToDomain(row);
  }

  public update(task: Task): Task {
    try {
      const result = this.updateStatement.run(taskToUpdateParameters(task));
      if (result.changes === 0) {
        throw new TaskRepositoryNotFoundError('Task to update was not found.');
      }
      return task;
    } catch (error) {
      if (error instanceof TaskRepositoryNotFoundError) {
        throw error;
      }
      if (isSqliteConstraintError(error)) {
        throw new TaskRepositoryConflictError('Task could not be updated because it conflicts.', {
          cause: error,
        });
      }
      throw new TaskRepositoryError('Task could not be updated.', { cause: error });
    }
  }

  public list(query: TaskListQuery): readonly Task[] {
    validateListQuery(query);

    try {
      const statement = this.getListStatement(query.statuses.length);
      const rows = statement.all(...query.statuses, query.limit);
      return rows.map(taskRowToDomain);
    } catch (error) {
      if (error instanceof TaskRepositoryError) {
        throw error;
      }
      throw new TaskRepositoryError('Tasks could not be listed.', { cause: error });
    }
  }

  private getListStatement(statusCount: number): Database.Statement<unknown[], TaskRow> {
    const existing = this.listStatements.get(statusCount);
    if (existing !== undefined) {
      return existing;
    }

    const placeholders = Array.from({ length: statusCount }, () => '?').join(', ');
    const statement = this.db.prepare<unknown[], TaskRow>(`
      SELECT ${TASK_COLUMN_LIST}
      FROM tasks
      WHERE status IN (${placeholders})
      ORDER BY updated_at DESC, created_at DESC, id ASC
      LIMIT ?
    `);
    this.listStatements.set(statusCount, statement);
    return statement;
  }
}

function isSqliteConstraintError(error: unknown): error is Error & { readonly code: string } {
  return (
    error instanceof Error &&
    'code' in error &&
    typeof error.code === 'string' &&
    error.code.startsWith('SQLITE_CONSTRAINT')
  );
}

function validateListQuery(query: TaskListQuery): void {
  if (query.statuses.length === 0 || query.statuses.some((status) => !isTaskStatus(status))) {
    throw new TaskRepositoryError('At least one valid task status is required.');
  }
  if (!Number.isInteger(query.limit) || query.limit < 1 || query.limit > 200) {
    throw new TaskRepositoryError('Task list limit must be an integer from 1 through 200.');
  }
}
