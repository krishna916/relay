# Task Application Services Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Provide a synchronous, reusable task application service for HTTP and future MCP adapters without bypassing domain rules.

**Architecture:** `createTaskApplication` will compose a repository port with injected clock and ID-generator dependencies. Thin use-case modules will validate application requests, delegate mutations to existing domain functions, and translate only repository failures into stable application errors. Tests will use an in-memory repository fake outside production code.

**Tech Stack:** TypeScript (strict/exact optional properties), Vitest, existing task domain and repository port.

## Global Constraints

- No HTTP, Zod, React, MCP SDK, `better-sqlite3`, DI framework, promises, generic status setter, or generic command bus imports.
- Application methods are synchronous and return the complete task persisted by `TaskRepository`.
- Domain validation, archived, and transition errors pass through unchanged.
- Repository absence maps to `TaskNotFoundError`; every other repository error maps to `TaskPersistenceError` with `cause` retained.
- List defaults to 100, permits only integer limits 1–200, rejects empty/invalid statuses, and de-duplicates in first-occurrence order.
- Every production behavior is introduced with a focused failing Vitest test, then minimally implemented.

---

### Task 1: Application contracts and test infrastructure

**Files:**

- Create: `src/application/tasks/clock.ts`
- Create: `src/application/tasks/id-generator.ts`
- Create: `src/application/tasks/task-application-errors.ts`
- Create: `tests/unit/application/tasks/task-test-fixtures.ts`
- Test: `tests/unit/application/tasks/task-application.test.ts`

**Produces:** `Clock`, `SystemClock`, `IdGenerator`, `UuidGenerator`, three typed application errors, deterministic fake dependencies, and a failure-injectable in-memory `TaskRepository`.

- [ ] **Step 1: Write tests that import the intended public contracts and assert stable error codes.**
- [ ] **Step 2: Run `pnpm test -- tests/unit/application/tasks/task-application.test.ts` and confirm the imports fail because contracts do not exist.**
- [ ] **Step 3: Add the small contracts and test-only fakes; `SystemClock.now()` creates a `Date`, and `UuidGenerator.generate()` calls `randomUUID()`.**
- [ ] **Step 4: Re-run the focused test and confirm it passes.**

### Task 2: Create, get, and list use cases

**Files:**

- Create: `src/application/tasks/use-cases/create-task.ts`
- Create: `src/application/tasks/use-cases/get-task.ts`
- Create: `src/application/tasks/use-cases/list-tasks.ts`
- Create: `src/application/tasks/task-application.ts`
- Modify: `tests/unit/application/tasks/task-application.test.ts`

**Consumes:** `TaskRepository`, domain `createTask`, `Clock`, `IdGenerator`, and application errors.

**Produces:** `CreateTaskInput`, `GetTaskInput`, `ListTasksInput`, and composition methods `create`, `get`, and `list`.

- [ ] **Step 1: Write focused failing tests for minimal/full HUMAN and AGENT creation, one ID/clock invocation, shared ISO timestamp, validation before persistence, found/missing get, list defaults/bounds/status normalization, and repository failure translation.**
- [ ] **Step 2: Run the focused test and confirm the missing application factory/API causes the expected failure.**
- [ ] **Step 3: Implement the three synchronous use cases and compose them in `createTaskApplication`; normalize IDs with the domain's `createTask` validation semantics without persisting.**
- [ ] **Step 4: Re-run the focused test and confirm all creation, retrieval, list, and translation cases pass.**

### Task 3: Metadata editing

**Files:**

- Create: `src/application/tasks/use-cases/edit-task.ts`
- Modify: `src/application/tasks/task-application.ts`
- Modify: `tests/unit/application/tasks/task-application.test.ts`

**Consumes:** domain `editTask`, `Clock`, repository load/update behavior, and `EditTaskInput` with exact optional-property semantics.

**Produces:** `edit(input): Task`, which changes only supplied editable fields and avoids persistence for no-ops.

- [ ] **Step 1: Write failing tests for each editable field, explicit null clearing, zero supplied fields, archived/domain errors, no-op update skipping, original-object immutability, and find/update failure translation.**
- [ ] **Step 2: Run the focused test and confirm `edit` is absent.**
- [ ] **Step 3: Implement `edit` by loading once, rejecting no editable fields, taking one timestamp, invoking domain `editTask`, and updating only a changed result.**
- [ ] **Step 4: Re-run the focused test and confirm all edit cases pass.**

### Task 4: Explicit lifecycle methods

**Files:**

- Create: `src/application/tasks/use-cases/transition-task.ts`
- Modify: `src/application/tasks/task-application.ts`
- Modify: `tests/unit/application/tasks/task-application.test.ts`

**Consumes:** all six explicit domain lifecycle functions, repository load/update behavior, and `Clock`.

**Produces:** `moveToInbox`, `activate`, `start`, `moveToBacklog`, `complete`, and `archive`; a private/shared orchestration helper is permitted but no generic public transition method.

- [ ] **Step 1: Add table-driven failing tests for all valid lifecycle methods, same-state no-op update skipping, invalid/archived transitions preserving domain error types, completed/archived restrictions, missing tasks, and repository failures.**
- [ ] **Step 2: Run the focused test and confirm lifecycle methods are absent.**
- [ ] **Step 3: Implement explicit methods over a private helper: load, obtain exactly one ISO timestamp, invoke the matching domain operation, skip update for identical output, otherwise persist and return.**
- [ ] **Step 4: Re-run the focused test and confirm every lifecycle case passes.**

### Task 5: Full verification and requirement audit

**Files:**

- Modify: `tests/unit/application/tasks/task-application.test.ts` only if coverage gaps are found.

- [ ] **Step 1: Confirm the public factory has intent-specific synchronous methods and production files import neither adapters nor SQLite.**
- [ ] **Step 2: Run `pnpm test -- tests/unit/application/tasks`.**
- [ ] **Step 3: Run `pnpm typecheck` and `pnpm lint`.**
- [ ] **Step 4: Run `pnpm verify`.**
- [ ] **Step 5: Compare implementation and test coverage against every Issue #7 acceptance criterion and report any gap before committing.**
