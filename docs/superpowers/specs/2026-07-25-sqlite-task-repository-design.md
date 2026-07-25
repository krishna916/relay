# SQLite Task Repository Design

## Objective

Implement issue #6 as a persistence-only slice: add the production `tasks` schema and a synchronous `better-sqlite3` repository that round-trips the task domain merged in issue #5. The work introduces no HTTP, MCP, React, lifecycle orchestration, ORM, query builder, caching, or speculative schema.

## Architecture

Application services depend on a `TaskRepository` port under `src/application/tasks/`. The concrete `SqliteTaskRepository` lives under `src/database/tasks/`, receives an already-open `Database.Database`, and neither creates nor closes that connection.

The adapter uses explicit SQL and explicit conversion between domain camelCase fields and SQLite snake_case columns. Every row is passed to `rehydrateTask`; the repository does not normalize titles, choose defaults, generate IDs or timestamps, or duplicate lifecycle transitions.

The implementation remains synchronous, matching `better-sqlite3`. Prepared statements are created once in the constructor where the query shape is fixed. Dynamic list statements vary only the count of generated `?` placeholders; all status and limit values remain bound parameters.

## Schema and Migration

Add immutable migration `src/database/migrations/0002_tasks.sql`. Do not edit `0001_scaffold.sql`.

The `tasks` table contains:

- `id TEXT PRIMARY KEY`
- `title TEXT NOT NULL`
- nullable `description`, `priority`, `workspace`, `source_context`, and `created_by_name`
- required `status` and `created_by_type`
- required `created_at` and `updated_at`
- nullable `started_at`, `completed_at`, and `archived_at`

SQLite checks enforce:

- trimmed title length from 1 through 300
- description length at most 10,000
- workspace length at most 255
- source context length at most 1,000
- creator name length at most 100
- exactly the six domain statuses
- priority is null or `LOW`, `NORMAL`, or `HIGH`
- creator type is `HUMAN` or `AGENT`
- an agent creator has a non-null, nonblank name
- `DONE` has `completed_at`
- `completed_at` appears only on `DONE` or `ARCHIVED`
- `ARCHIVED` has `archived_at`
- `archived_at` appears only on `ARCHIVED`

The database does not generate task IDs or timestamps. Timestamps are stored as UTC ISO-8601 text supplied by the caller. Domain rehydration validates their exact normalized representation and lifecycle consistency.

Create only:

```sql
CREATE INDEX idx_tasks_status_updated_at
ON tasks(status, updated_at DESC, created_at DESC, id ASC);
```

Do not add triggers, a version column, soft-delete flag, JSON storage, or foreign tables.

## Application Port and Errors

The application contract is:

```ts
export interface TaskListQuery {
  readonly statuses: readonly TaskStatus[];
  readonly limit: number;
}

export interface TaskRepository {
  create(task: Task): Task;
  findById(id: string): Task | null;
  update(task: Task): Task;
  list(query: TaskListQuery): readonly Task[];
}
```

Persistence failures use stable error types and codes:

- `TaskRepositoryError` — `TASK_REPOSITORY_ERROR`
- `TaskRepositoryNotFoundError` — `TASK_NOT_FOUND`
- `TaskRepositoryConflictError` — `TASK_CONFLICT`
- `TaskRepositoryCorruptionError` — `TASK_DATA_CORRUPT`

Errors retain the original failure as `cause` when one exists. Public messages identify the operation without exposing SQL text or database file paths.

SQLite constraint errors, including duplicate IDs, become conflicts. A missing update target becomes not-found. A row rejected by `rehydrateTask` becomes corruption. Other statement failures become the base repository error. `findById` returns `null` only when no row exists; it does not collapse infrastructure failures into absence.

## Row Mapping and Repository Behavior

`task-row.ts` owns:

- the exact selected-row shape
- the exact named insert/update binding shape
- domain-to-parameter conversion
- row-to-domain conversion through `rehydrateTask`

The repository never uses `SELECT *`.

`create` inserts every persisted column and returns the input validated task after a successful insert.

`findById` selects every named column and returns the mapped task or `null`.

`update` changes all mutable persisted columns while preserving `id` and `created_at`. It uses `WHERE id = ?`, inspects `run().changes`, throws not-found for zero changes, and returns the validated input task on success.

`list` requires at least one status and an integer limit from 1 through 200. Results are ordered by `updated_at DESC, created_at DESC, id ASC`, including the ID tie-breaker. No matches return an empty array.

## Test Isolation and Coverage

`createTemporaryDatabase` remains unmigrated for migration-runner tests. A new `createMigratedTemporaryDatabase` calls the existing connection factory, runs all migrations, and preserves the same cleanup contract.

Each repository integration test uses a temporary file-backed database, never `RELAY_DB_PATH`. Tests cover:

- fresh schema, columns, checks, index, two migration records, and migration rerun
- minimal and full round-trips, all nullable fields, all statuses, and all priority values
- update persistence plus preservation of ID and creation time
- missing find and typed missing-update behavior
- duplicate IDs and every relevant direct-insert check violation
- one-status and multi-status lists, empty results, deterministic ordering, and limits 1, 200, 0, and 201
- invalid persisted row mapping as corruption
- injected connection remains open

Coverage expands from `src/database/*.ts` to `src/database/**/*.ts`; existing 80% thresholds remain unchanged.

## Implementation Strategy

Work proceeds in strict red-green-refactor cycles:

1. Add migration assertions, observe failure, then add `0002_tasks.sql`.
2. Add port/error tests where behavior is executable, then define the contracts.
3. Add row-mapping tests, observe failure, then implement explicit conversion.
4. Add create/find integration tests, observe failure, then implement them.
5. Add update/list integration tests, observe failure, then implement them.
6. Add conflict, constraint, corruption, ownership, and boundary tests.
7. Expand coverage inclusion and run focused tests, type checking, linting, and the complete `pnpm verify` gate.

The human merge review should confirm that `0001_scaffold.sql` is unchanged, SQL is explicit and parameterized, IDs and timestamps remain application-generated, all tests are isolated, and no transition logic or out-of-scope framework entered persistence.
