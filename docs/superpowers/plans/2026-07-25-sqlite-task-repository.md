# SQLite Task Repository Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add the production SQLite task schema and a synchronous repository that safely round-trips validated domain tasks.

**Architecture:** Application services consume a persistence-agnostic `TaskRepository` port. `SqliteTaskRepository` implements the port with explicit prepared SQL, delegates persisted-value validation to `rehydrateTask`, and translates SQLite and mapping failures into stable repository errors.

**Tech Stack:** TypeScript 5.9, Node.js 24, `better-sqlite3` 13, SQLite plain-SQL migrations, Vitest 4, pnpm 10.2.

## Global Constraints

- Persistence only: no HTTP, MCP, React, lifecycle orchestration, ORM, query builder, caching, or speculative fields.
- Do not edit `src/database/migrations/0001_scaffold.sql`.
- IDs and UTC ISO-8601 timestamps are supplied by the domain/application layer.
- The repository is synchronous and does not own or close its injected `Database.Database`.
- Every select names its columns; every value is parameterized.
- Every persisted row passes through `rehydrateTask`.
- List ordering is `updated_at DESC, created_at DESC, id ASC`.
- List statuses must be nonempty and limits must be integers from 1 through 200.
- Temporary file-backed databases must be used for integration tests.
- Existing coverage thresholds remain 80%.

---

## File Structure

- `src/database/migrations/0002_tasks.sql`: task table checks and the sole initial list index.
- `src/application/tasks/task-repository.ts`: synchronous application-layer repository port.
- `src/application/tasks/task-repository-errors.ts`: stable persistence error hierarchy.
- `src/database/tasks/task-row.ts`: explicit row, binding, and domain mapping.
- `src/database/tasks/sqlite-task-repository.ts`: prepared SQLite adapter and error translation.
- `tests/support/temporary-database.ts`: migrated temporary database factory.
- `tests/integration/database-migrations.test.ts`: schema and migration assertions.
- `tests/integration/task-repository.test.ts`: repository behavior and isolation coverage.
- `vitest.config.ts`: recursive database coverage inclusion.

### Task 1: Task schema migration

**Files:**

- Create: `src/database/migrations/0002_tasks.sql`
- Modify: `tests/integration/database-migrations.test.ts`

**Interfaces:**

- Produces: the `tasks` table, `idx_tasks_status_updated_at`, and migration version 2.

- [ ] **Step 1: Write failing migration assertions**

Expand the fresh-migration test to assert two applied migrations, the exact 14 task columns via `PRAGMA table_info(tasks)`, and the named index via `PRAGMA index_list(tasks)`. Add direct invalid inserts demonstrating that title, literals, agent name, and lifecycle timestamp checks reject bad rows.

```ts
expect(migrations).toEqual([
  { version: 1, name: 'scaffold' },
  { version: 2, name: 'tasks' },
]);
expect(db.prepare('PRAGMA table_info(tasks)').all()).toHaveLength(14);
expect(db.prepare('PRAGMA index_list(tasks)').all()).toEqual(
  expect.arrayContaining([expect.objectContaining({ name: 'idx_tasks_status_updated_at' })]),
);
expect(() => insertRawTask({ title: '   ' })).toThrow();
```

- [ ] **Step 2: Run the focused migration test and verify RED**

Run: `pnpm.cmd test -- tests/integration/database-migrations.test.ts`

Expected: FAIL because `tasks` and migration version 2 do not exist.

- [ ] **Step 3: Add the migration**

Create `0002_tasks.sql` with the 14 specified columns, literal/length/creator/lifecycle checks, and:

```sql
CREATE INDEX idx_tasks_status_updated_at
ON tasks(status, updated_at DESC, created_at DESC, id ASC);
```

- [ ] **Step 4: Run the focused migration test and verify GREEN**

Run: `pnpm.cmd test -- tests/integration/database-migrations.test.ts`

Expected: PASS, including rerunning migrations without duplicating schema state.

### Task 2: Repository contracts, errors, and row mapping

**Files:**

- Create: `src/application/tasks/task-repository.ts`
- Create: `src/application/tasks/task-repository-errors.ts`
- Create: `src/database/tasks/task-row.ts`
- Create: `tests/integration/task-repository.test.ts`

**Interfaces:**

- Consumes: `Task`, `TaskStatus`, `RehydrateTaskInput`, and `rehydrateTask`.
- Produces: `TaskListQuery`, `TaskRepository`.
- Produces: `TaskRepositoryError`, `TaskRepositoryNotFoundError`, `TaskRepositoryConflictError`, and `TaskRepositoryCorruptionError`.
- Produces: `TASK_COLUMN_LIST`, `TaskRow`, `TaskParameters`, `taskToParameters(task)`, and `taskRowToDomain(row)`.

- [ ] **Step 1: Write failing mapping tests**

Use a literal database-style row and a separately written literal domain object. Assert that mapping handles every snake_case field and that invalid persisted values become a corruption error rather than leaking `TaskValidationError`.

```ts
expect(taskRowToDomain(FULL_ROW)).toEqual(FULL_TASK);
expect(() => taskRowToDomain({ ...FULL_ROW, status: 'UNKNOWN' })).toThrow(
  TaskRepositoryCorruptionError,
);
expect(taskToParameters(FULL_TASK)).toEqual(FULL_PARAMETERS);
```

- [ ] **Step 2: Run the repository test and verify RED**

Run: `pnpm.cmd test -- tests/integration/task-repository.test.ts`

Expected: FAIL because the application and database task modules do not exist.

- [ ] **Step 3: Define the port and error hierarchy**

Implement the exact synchronous port from the issue. Give each error a literal `code`, set `name` through `new.target.name`, and accept an optional `{ cause }` without embedding the cause message in the public message.

```ts
export class TaskRepositoryError extends Error {
  public readonly code: string = 'TASK_REPOSITORY_ERROR';
  public constructor(message: string, options?: ErrorOptions) {
    super(message, options);
    this.name = new.target.name;
  }
}
```

Derived classes override the code with `TASK_NOT_FOUND`, `TASK_CONFLICT`, or `TASK_DATA_CORRUPT`.

- [ ] **Step 4: Implement explicit row conversion**

Define all 14 fields in `TaskRow` and `TaskParameters`. `taskToParameters` maps camelCase to snake_case. `taskRowToDomain` constructs a complete `RehydrateTaskInput`, calls `rehydrateTask`, and wraps any failure with:

```ts
throw new TaskRepositoryCorruptionError('Stored task data is invalid.', { cause: error });
```

- [ ] **Step 5: Run the repository mapping tests and verify GREEN**

Run: `pnpm.cmd test -- tests/integration/task-repository.test.ts`

Expected: PASS for full, minimal/null, and corrupt mapping cases.

### Task 3: Temporary database helper and create/find

**Files:**

- Modify: `tests/support/temporary-database.ts`
- Modify: `tests/integration/task-repository.test.ts`
- Create: `src/database/tasks/sqlite-task-repository.ts`

**Interfaces:**

- Consumes: `TaskRepository`, row mapping, repository errors, and an open `Database.Database`.
- Produces: `createMigratedTemporaryDatabase(): TemporaryDatabaseContext`.
- Produces: `new SqliteTaskRepository(db)`, `create(task)`, and `findById(id)`.

- [ ] **Step 1: Add the migrated helper**

Implement the helper by composing existing behavior:

```ts
export function createMigratedTemporaryDatabase(): TemporaryDatabaseContext {
  const context = createTemporaryDatabase();
  runMigrations(context.db);
  return context;
}
```

Keep `createTemporaryDatabase` unchanged for migration-runner tests.

- [ ] **Step 2: Write failing create/find tests**

Create a new migrated file-backed database per test. Cover minimal and full tasks, all optional nulls, all six statuses, all priorities, missing find, duplicate ID, and connection ownership.

```ts
const repository = new SqliteTaskRepository(context.db);
expect(repository.create(FULL_TASK)).toEqual(FULL_TASK);
expect(repository.findById(FULL_TASK.id)).toEqual(FULL_TASK);
expect(repository.findById('missing')).toBeNull();
expect(() => repository.create(FULL_TASK)).toThrow(TaskRepositoryConflictError);
```

After repository calls, assert `context.db.open` remains true.

- [ ] **Step 3: Run create/find tests and verify RED**

Run: `pnpm.cmd test -- tests/integration/task-repository.test.ts`

Expected: FAIL because `SqliteTaskRepository` is not implemented.

- [ ] **Step 4: Implement constructor, create, and find**

Prepare fixed insert and find statements in the constructor. Insert all columns with named parameters. Select `TASK_COLUMN_LIST`, never `*`. Translate `SQLITE_CONSTRAINT...` errors to conflict and all other database failures to `TaskRepositoryError`; do not convert a missing row to an exception.

- [ ] **Step 5: Run create/find tests and verify GREEN**

Run: `pnpm.cmd test -- tests/integration/task-repository.test.ts`

Expected: PASS for round-trip, absence, conflict, and connection ownership.

### Task 4: Update and filtered list

**Files:**

- Modify: `tests/integration/task-repository.test.ts`
- Modify: `src/database/tasks/sqlite-task-repository.ts`

**Interfaces:**

- Produces: `update(task): Task` and `list(query): readonly Task[]`.

- [ ] **Step 1: Write failing update tests**

Insert a task, update every mutable persisted field and lifecycle timestamp, and assert that ID and `created_at` remain unchanged in SQLite. Assert a missing update throws `TaskRepositoryNotFoundError`.

```ts
expect(repository.update(UPDATED_TASK)).toEqual(UPDATED_TASK);
expect(repository.findById(UPDATED_TASK.id)).toEqual(UPDATED_TASK);
expect(() => repository.update({ ...UPDATED_TASK, id: 'missing' })).toThrow(
  TaskRepositoryNotFoundError,
);
```

- [ ] **Step 2: Run update tests and verify RED**

Run: `pnpm.cmd test -- tests/integration/task-repository.test.ts`

Expected: FAIL because `update` is not implemented.

- [ ] **Step 3: Implement update**

Prepare an update statement that assigns title, description, status, priority, workspace, source context, and updated/started/completed/archived timestamps. It filters by ID and never assigns `id`, `created_by_type`, `created_by_name`, or `created_at`. Inspect `run().changes`; zero means not-found.

- [ ] **Step 4: Run update tests and verify GREEN**

Run: `pnpm.cmd test -- tests/integration/task-repository.test.ts`

Expected: PASS for persistence, immutable creation fields, and not-found.

- [ ] **Step 5: Write failing list tests**

Cover one and multiple statuses, empty matches, all six status values, deterministic ordering with equal updated/created timestamps resolved by ascending ID, limits 1 and 200, and rejection of empty statuses, 0, 201, fractions, and nonfinite values.

```ts
expect(repository.list({ statuses: ['ACTIVE'], limit: 200 })).toEqual([activeTask]);
expect(repository.list({ statuses: ['INBOX', 'BACKLOG'], limit: 2 })).toEqual([
  newestInbox,
  backlog,
]);
expect(() => repository.list({ statuses: [], limit: 1 })).toThrow(TaskRepositoryError);
```

- [ ] **Step 6: Run list tests and verify RED**

Run: `pnpm.cmd test -- tests/integration/task-repository.test.ts`

Expected: FAIL because `list` is not implemented.

- [ ] **Step 7: Implement list**

Validate query shape before preparing SQL. Generate only the required comma-separated `?` placeholders, bind statuses followed by the limit, select named columns, order by the documented three keys, and map every row.

- [ ] **Step 8: Run list tests and verify GREEN**

Run: `pnpm.cmd test -- tests/integration/task-repository.test.ts`

Expected: PASS for filters, empty results, stable order, valid boundaries, and invalid queries.

### Task 5: Failure translation and corruption coverage

**Files:**

- Modify: `tests/integration/task-repository.test.ts`
- Modify: `src/database/tasks/sqlite-task-repository.ts`

**Interfaces:**

- Refines: operation-specific failure translation without SQL/file-path disclosure.

- [ ] **Step 1: Write failing corruption and infrastructure tests**

Use `PRAGMA ignore_check_constraints = ON` only within a temporary test database to insert an invalid status, restore checks, and assert `findById` throws `TaskRepositoryCorruptionError` whose cause is the domain validation error.

Close a temporary injected database and assert repository operations throw `TaskRepositoryError`, preserve the SQLite failure as `cause`, and expose neither SQL text nor the temporary file path in `message`.

- [ ] **Step 2: Run failure tests and verify RED**

Run: `pnpm.cmd test -- tests/integration/task-repository.test.ts`

Expected: FAIL if any operation leaks domain/SQLite errors or sensitive details.

- [ ] **Step 3: Centralize safe error translation**

Keep already-typed repository errors unchanged. Convert SQLite extended codes beginning with `SQLITE_CONSTRAINT` to conflict only for write operations. Convert other unknown failures to an operation-specific base error with `{ cause }`. Leave `taskRowToDomain` responsible for corruption wrapping.

- [ ] **Step 4: Run failure tests and verify GREEN**

Run: `pnpm.cmd test -- tests/integration/task-repository.test.ts`

Expected: PASS with typed errors, retained causes, and safe public messages.

### Task 6: Coverage and complete quality gate

**Files:**

- Modify: `vitest.config.ts`
- Verify: all files changed by this plan

**Interfaces:**

- Produces: recursive authored database coverage without changing thresholds.

- [ ] **Step 1: Expand the coverage glob**

Change:

```ts
'src/database/*.ts';
```

to:

```ts
'src/database/**/*.ts';
```

- [ ] **Step 2: Format authored files**

Run:

```powershell
.\node_modules\.bin\prettier.cmd --write src/application/tasks src/database/tasks src/database/migrations/0002_tasks.sql tests/integration/database-migrations.test.ts tests/integration/task-repository.test.ts tests/support/temporary-database.ts vitest.config.ts docs/superpowers/plans/2026-07-25-sqlite-task-repository.md
```

- [ ] **Step 3: Run focused verification**

Run:

```powershell
pnpm.cmd test -- tests/integration/database-migrations.test.ts tests/integration/task-repository.test.ts
pnpm.cmd typecheck
pnpm.cmd lint
```

Expected: all commands exit 0.

- [ ] **Step 4: Run the complete quality gate**

Run: `pnpm.cmd verify`

Expected: exit 0 with coverage thresholds met, builds succeeding, assets valid, and no high-severity audit findings.

- [ ] **Step 5: Review scope and migration immutability**

Run `git diff --check`, `git diff -- src/database/migrations/0001_scaffold.sql`, and `git status --short`. Confirm `0001_scaffold.sql` has no diff; no HTTP, MCP, React, ORM, transition logic, generated IDs, or generated task timestamps were added.
