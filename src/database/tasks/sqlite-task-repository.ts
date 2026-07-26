import type Database from 'better-sqlite3';
import {
  TaskRepositoryConflictError,
  TaskRepositoryCorruptionError,
  TaskRepositoryError,
  TaskRepositoryNotFoundError,
} from '../../application/tasks/task-repository-errors.js';
import type {
  SessionCaptureQuery,
  SimilarTaskQuery,
  TaskListQuery,
  TaskRepository,
} from '../../application/tasks/task-repository.js';
import type { Task } from '../../domain/task/task.js';
import { isTaskStatus, TASK_STATUSES } from '../../domain/task/task-status.js';
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
  private readonly sessionCaptureStatement: Database.Statement<[string, number], TaskRow>;
  private readonly similarStatements = new Map<boolean, Database.Statement<unknown[], TaskRow>>();

  public constructor(private readonly db: Database.Database) {
    this.insertStatement = db.prepare<TaskParameters>(`
      INSERT INTO tasks (
        id,
        title,
        normalized_title,
        description,
        status,
        priority,
        workspace,
        source_context,
        created_by_type,
        created_by_name,
        session_id,
        created_at,
        updated_at,
        started_at,
        completed_at,
        archived_at
      ) VALUES (
        @id,
        @title,
        @normalized_title,
        @description,
        @status,
        @priority,
        @workspace,
        @source_context,
        @created_by_type,
        @created_by_name,
        @session_id,
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
    this.sessionCaptureStatement = db.prepare<[string, number], TaskRow>(`
      SELECT ${TASK_COLUMN_LIST} FROM tasks
      WHERE created_by_type = 'AGENT' AND session_id = ?
      ORDER BY created_at ASC, id ASC LIMIT ?
    `);
    this.updateStatement = db.prepare<TaskUpdateParameters>(`
      UPDATE tasks
      SET
        title = @title,
        normalized_title = @normalized_title,
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
      const row = this.findStatement.get(task.id);
      if (row === undefined) {
        throw new TaskRepositoryNotFoundError('Task to update was not found.');
      }
      return taskRowToDomain(row);
    } catch (error) {
      if (
        error instanceof TaskRepositoryNotFoundError ||
        error instanceof TaskRepositoryCorruptionError
      ) {
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

  public listSessionCaptures(query: SessionCaptureQuery): readonly Task[] {
    validateBoundedQuery(query, 'session capture', 100);
    try {
      return this.sessionCaptureStatement.all(query.sessionId, query.limit).map(taskRowToDomain);
    } catch (error) {
      throw new TaskRepositoryError('Session captures could not be read.', { cause: error });
    }
  }

  public findSimilar(query: SimilarTaskQuery): readonly Task[] {
    validateBoundedQuery(query, 'similar task', 5);
    if (typeof query.normalizedTitle !== 'string' || query.normalizedTitle.length === 0) {
      throw new TaskRepositoryError('Similar task query title is invalid.');
    }
    if (query.workspace !== null && typeof query.workspace !== 'string') {
      throw new TaskRepositoryError('Similar task query workspace is invalid.');
    }
    try {
      const withWorkspace = query.workspace !== null;
      const statement = this.getSimilarStatement(withWorkspace);
      const parameters = withWorkspace
        ? [query.normalizedTitle, query.workspace, query.limit]
        : [query.normalizedTitle, query.limit];
      return statement.all(...parameters).map(taskRowToDomain);
    } catch (error) {
      if (error instanceof TaskRepositoryError) throw error;
      throw new TaskRepositoryError('Similar tasks could not be read.', { cause: error });
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

  private getSimilarStatement(withWorkspace: boolean): Database.Statement<unknown[], TaskRow> {
    const existing = this.similarStatements.get(withWorkspace);
    if (existing !== undefined) return existing;
    const workspaceOrder = withWorkspace ? 'CASE WHEN workspace = ? THEN 0 ELSE 1 END,' : '';
    const statement = this.db.prepare<unknown[], TaskRow>(`
      SELECT ${TASK_COLUMN_LIST}
      FROM tasks
      WHERE normalized_title = ? AND status <> 'ARCHIVED'
      ORDER BY ${workspaceOrder} updated_at DESC, id ASC
      LIMIT ?
    `);
    this.similarStatements.set(withWorkspace, statement);
    return statement;
  }
}

function validateBoundedQuery(
  query: { readonly sessionId?: unknown; readonly limit?: unknown } | null,
  name: string,
  maximum: number,
): void {
  const limit = query?.limit;
  if (
    query === null ||
    typeof query !== 'object' ||
    typeof limit !== 'number' ||
    !Number.isInteger(limit) ||
    limit < 1 ||
    limit > maximum
  ) {
    throw new TaskRepositoryError(
      `${name} query limit must be an integer from 1 through ${maximum}.`,
    );
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
  if (query === null || typeof query !== 'object' || !Array.isArray(query.statuses)) {
    throw new TaskRepositoryError('Task list query is invalid.');
  }
  if (query.statuses.length === 0 || query.statuses.some((status) => !isTaskStatus(status))) {
    throw new TaskRepositoryError('At least one valid task status is required.');
  }
  if (query.statuses.length > TASK_STATUSES.length) {
    throw new TaskRepositoryError('Task status filters exceed the supported status count.');
  }
  if (new Set(query.statuses).size !== query.statuses.length) {
    throw new TaskRepositoryError('Task status filters must not contain duplicates.');
  }
  if (!Number.isInteger(query.limit) || query.limit < 1 || query.limit > 200) {
    throw new TaskRepositoryError('Task list limit must be an integer from 1 through 200.');
  }
}
