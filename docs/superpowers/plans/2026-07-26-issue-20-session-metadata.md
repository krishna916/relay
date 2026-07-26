# Issue #20 Session Metadata Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add immutable nullable task session metadata, session-capture retrieval, advisory duplicate lookup, shared runtime composition, and compatible HTTP DTOs without adding MCP or CLI behavior.

**Architecture:** Preserve `sessionId` as task-owned metadata from domain creation through SQLite mapping and DTO serialization, but deliberately exclude it from all mutation models and SQL. Add focused application use cases over new parameterized repository queries; the HTTP adapter consumes an extracted adapter-neutral runtime factory.

**Tech Stack:** TypeScript, Vitest, better-sqlite3, Zod, Node.js 24, pnpm.

## Global Constraints

- Do not modify immutable migration `0002_tasks.sql`; add `0003_task_session_id.sql`.
- `sessionId` is opaque metadata: trim it, require 1..128 characters matching `^[A-Za-z0-9._:-]+$`, and keep it immutable.
- AGENT tasks require both a non-null normalized creator name and a valid session ID; HUMAN tasks permit only null/omitted session ID.
- Session capture queries match AGENT rows exactly and include every status, ordered `createdAt ASC, id ASC`.
- Similarity is advisory only: normalized title, max five results, archived rows excluded, deterministic ranking.
- Do not add MCP schemas, handlers, lifecycle, stdio tests, CLI commands, session aggregates, timers, or background processing.

---

## File Structure

- `src/domain/task/task.ts` — task session metadata and creator/session invariants.
- `src/database/migrations/0003_task_session_id.sql` — additive, upgrade-safe column and retrieval index.
- `src/database/tasks/task-row.ts` / `sqlite-task-repository.ts` — immutable mapping, inserts, and bounded reads.
- `src/application/tasks/session-id.ts` / `title-normalization.ts` — reusable validation and deterministic normalization.
- `src/application/tasks/use-cases/list-session-captures.ts` / `find-similar-tasks.ts` — adapter-neutral query defaults and bounds.
- `src/application/tasks/task-repository.ts` / `task-application.ts` — public repository and application contracts.
- `src/interfaces/shared/create-task-runtime.ts` — reusable synchronous composition root.
- `src/interfaces/http/create-task-runtime.ts` / `main.ts` / `task-dto.ts` — runtime relocation and full DTO compatibility.

### Task 1: Domain session metadata and invariants

**Files:**

- Modify: `tests/unit/domain/task/task.test.ts`, `src/domain/task/task.ts`

**Interfaces:**

- Produces: `Task.sessionId`, `CreateTaskInput.sessionId`, and `RehydrateTaskInput.sessionId` as `string | null`; `TaskChanges` intentionally has no session field.

- [ ] **Step 1: Write failing domain tests** for valid 1/128-character IDs, whitespace normalization, invalid/empty/129-character IDs, AGENT/HUMAN creator-session matrix, corrupt rehydration, and edit immutability.
- [ ] **Step 2: Run `pnpm test -- tests/unit/domain/task/task.test.ts`** and confirm the new assertions fail because `sessionId` is not implemented.
- [ ] **Step 3: Implement `sessionId`** in task creation/rehydration with one validator and enforce creator/session consistency after normalization.
- [ ] **Step 4: Run `pnpm test -- tests/unit/domain/task/task.test.ts`** and confirm all domain tests pass.
- [ ] **Step 5: Commit** `git add src/domain/task/task.ts tests/unit/domain/task/task.test.ts && git commit -m "feat: add immutable task session metadata"`.

### Task 2: Add and verify migration v3

**Files:**

- Create: `src/database/migrations/0003_task_session_id.sql`
- Modify: `tests/integration/database-migrations.test.ts`

**Interfaces:**

- Produces: nullable `tasks.session_id` and `idx_tasks_created_by_session_created_at` on `(created_by_type, session_id, created_at ASC, id ASC)`.

- [ ] **Step 1: Write failing migration tests** that seed a v2 database/task, apply v3, assert `session_id IS NULL`, schema/index presence, SQL constraints, version 3, and idempotent rerun.
- [ ] **Step 2: Run `pnpm test -- tests/integration/database-migrations.test.ts`** and verify the v3 assertions fail.
- [ ] **Step 3: Add migration SQL** using `ALTER TABLE tasks ADD COLUMN session_id TEXT NULL CHECK (...)` and `CREATE INDEX`; preserve v2 data and leave `0002_tasks.sql` untouched.
- [ ] **Step 4: Run `pnpm test -- tests/integration/database-migrations.test.ts`** and confirm migration tests pass.
- [ ] **Step 5: Commit** the migration and migration tests.

### Task 3: Persist immutable metadata and repository reads

**Files:**

- Modify: `src/application/tasks/task-repository.ts`, `src/database/tasks/task-row.ts`, `src/database/tasks/sqlite-task-repository.ts`, `tests/integration/task-repository.test.ts`

**Interfaces:**

- Produces: `SessionCaptureQuery`, `SimilarTaskQuery`, `TaskRepository.listSessionCaptures`, and `TaskRepository.findSimilar`.

- [ ] **Step 1: Write failing mapping/repository tests** for `session_id` round trips; update preserving the original session ID; session isolation/all-status ordering; similar-query archive exclusion, bounds, and ranking.
- [ ] **Step 2: Run `pnpm test -- tests/integration/task-repository.test.ts`** and confirm missing mapping/query behavior fails.
- [ ] **Step 3: Extend row types, select/insert bindings and `TASK_COLUMN_LIST`**; exclude `session_id` from update parameters and SQL.
- [ ] **Step 4: Add parameterized repository statements** that validate positive bounded limits before SQL, query AGENT exact sessions by `created_at ASC, id ASC`, and query normalized non-archived titles ranked by workspace, `updated_at DESC`, `id ASC`.
- [ ] **Step 5: Run `pnpm test -- tests/integration/task-repository.test.ts`** and confirm all repository tests pass.
- [ ] **Step 6: Commit** repository contracts, implementation, and tests.

### Task 4: Application query surface

**Files:**

- Create: `src/application/tasks/session-id.ts`, `src/application/tasks/title-normalization.ts`, `src/application/tasks/use-cases/list-session-captures.ts`, `src/application/tasks/use-cases/find-similar-tasks.ts`
- Modify: `src/application/tasks/use-cases/create-task.ts`, `src/application/tasks/task-application.ts`, `tests/unit/application/tasks/task-application.test.ts`, `tests/unit/application/tasks/task-test-fixtures.ts`

**Interfaces:**

- Produces: optional `CreateTaskInput.sessionId`, `ListSessionCapturesInput`, `FindSimilarTasksInput`, application methods `listSessionCaptures` and `findSimilar`.

- [ ] **Step 1: Write failing application tests** for create forwarding, session format/default limit 100/range 1..100, title normalization, default limit 5/range 1..5, and query/ranking forwarding.
- [ ] **Step 2: Run `pnpm test -- tests/unit/application/tasks/task-application.test.ts`** and confirm failures are due to absent public methods/helpers.
- [ ] **Step 3: Implement strict helper validation and normalization** (`trim`, `toLowerCase`, whitespace collapse, repeatedly strip trailing `[.!?]`, trim) and thin use cases that delegate to the repository.
- [ ] **Step 4: Extend the in-memory test repository** with the two contracts and observability required by application assertions.
- [ ] **Step 5: Run `pnpm test -- tests/unit/application/tasks/task-application.test.ts`** and confirm application tests pass.
- [ ] **Step 6: Commit** application interfaces, use cases, helpers, and tests.

### Task 5: Extract adapter-neutral runtime and retain HTTP behavior

**Files:**

- Create: `src/interfaces/shared/create-task-runtime.ts`, `tests/unit/interfaces/shared/create-task-runtime.test.ts`
- Modify: `src/interfaces/http/create-task-runtime.ts`, `src/interfaces/http/main.ts`, `src/interfaces/http/task-dto.ts`, `tests/integration/http-tasks.test.ts`

**Interfaces:**

- Produces: `TaskRuntime` and `createTaskRuntime(options?: { databasePath?: string })` independent of HTTP/MCP/CLI.

- [ ] **Step 1: Write failing runtime tests** for migrations-before-repository behavior, idempotent close, and closing an opened database after startup failure.
- [ ] **Step 2: Write failing HTTP regression assertions** that full DTO responses contain `sessionId: null`, HTTP creation remains HUMAN/null, and PATCH rejects `sessionId`.
- [ ] **Step 3: Run focused shared/HTTP tests** and verify the new assertions fail.
- [ ] **Step 4: Move the runtime factory to `interfaces/shared`**, preserving synchronous composition, database-path resolution through `createDatabaseConnection`, migrations, dependency injection, and close-once/failure cleanup. Re-export from the old HTTP path only if existing imports need it.
- [ ] **Step 5: Update DTO serialization**; keep HTTP request schemas unchanged so create omits session ID and PATCH remains strict.
- [ ] **Step 6: Run `pnpm test -- tests/unit/interfaces/shared tests/unit/interfaces/http tests/integration/http-tasks.test.ts`** and confirm regression coverage passes.
- [ ] **Step 7: Commit** runtime extraction and HTTP compatibility tests.

### Task 6: Verify the complete foundation

**Files:**

- Modify only if formatter or asset validation identifies directly related required adjustments.

- [ ] **Step 1: Run focused suites**:
      `pnpm test -- tests/unit/domain/task tests/unit/application/tasks`
      `pnpm test -- tests/integration/database-migrations.test.ts tests/integration/task-repository.test.ts`
      `pnpm test -- tests/unit/interfaces/shared tests/unit/interfaces/http tests/integration/http-tasks.test.ts`
- [ ] **Step 2: Run repository verification**: `pnpm verify`.
- [ ] **Step 3: Inspect the diff** to confirm no MCP/CLI production code, no `0002_tasks.sql` change, and no mutable `sessionId` update path.
- [ ] **Step 4: Commit any verification-only formatting changes** with a focused message.
