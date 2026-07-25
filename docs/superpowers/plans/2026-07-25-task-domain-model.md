# Task Domain Model Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Provide Relay's dependency-free, immutable task domain with validation, editing, and explicit lifecycle operations required by issue #5.

**Architecture:** A focused `src/domain/task` module owns string-literal status and priority definitions, task construction/rehydration/editing, typed errors, and lifecycle transitions. `task.ts` validates and normalizes complete task values; `task-lifecycle.ts` delegates all transitions to a private table-driven helper so public intent-specific functions cannot set arbitrary statuses.

**Tech Stack:** TypeScript 5.9, Vitest 4, ESLint, Prettier, pnpm.

## Global Constraints

- Domain imports no SQLite, HTTP, React, MCP, Zod, or adapter module.
- Use readonly objects and string-literal unions; do not introduce TypeScript enums.
- All domain times are normalized UTC ISO-8601 strings; all operations receive explicit `now` and never call `new Date()`.
- Use the exact shared-contract limits: ID 1-100, title 1-300, description 10,000, workspace 255, source context 1,000, creator name 100 characters.
- `createTask` always yields `INBOX`; no generic status setter is exposed.
- Real edits/transitions return a new object and update `updatedAt`; no-op operations return the original object unchanged.

---

## File Structure

- `src/domain/task/task-status.ts`: fixed statuses and `TaskStatus` union.
- `src/domain/task/task-priority.ts`: fixed priorities and `TaskPriority` union.
- `src/domain/task/task-errors.ts`: stable, typed domain errors.
- `src/domain/task/task.ts`: task types, normalization/validation, create, rehydrate, and edit operations.
- `src/domain/task/task-lifecycle.ts`: intent-specific status changes and transition table.
- `tests/unit/domain/task/task.test.ts`: construction, rehydration, and editing tests.
- `tests/unit/domain/task/task-lifecycle.test.ts`: transition-table and timestamp tests.
- `src/domain/README.md`: concise, accurate domain-layer documentation.

### Task 1: Task values, validation, creation, and rehydration

**Files:**

- Create: `src/domain/task/task-status.ts`
- Create: `src/domain/task/task-priority.ts`
- Create: `src/domain/task/task-errors.ts`
- Create: `src/domain/task/task.ts`
- Create: `tests/unit/domain/task/task.test.ts`

**Interfaces:**

- Produces: `TaskStatus`, `TASK_STATUSES`, `TaskPriority`, `TASK_PRIORITIES`, `TaskCreatorType`, `Task`, `CreateTaskInput`, `RehydrateTaskInput`, `TaskChanges`, `createTask`, `rehydrateTask`, `editTask`.
- Produces: `TaskValidationError` with `readonly code = 'TASK_VALIDATION'` and `readonly field`.

- [ ] **Step 1: Write failing task-value tests**

```ts
expect(TASK_STATUSES).toEqual(['INBOX', 'ACTIVE', 'IN_PROGRESS', 'BACKLOG', 'DONE', 'ARCHIVED']);
expect(TASK_PRIORITIES).toEqual(['LOW', 'NORMAL', 'HIGH']);

expect(() => createTask({ id: ' task-1 ', title: '   ', createdByType: 'HUMAN' }, NOW)).toThrow(
  TaskValidationError,
);
```

- [ ] **Step 2: Run the focused test to verify it fails**

Run: `pnpm test -- tests/unit/domain/task/task.test.ts`

Expected: FAIL because the task-domain modules do not exist.

- [ ] **Step 3: Implement fixed value unions and domain errors**

```ts
export const TASK_STATUSES = [
  'INBOX',
  'ACTIVE',
  'IN_PROGRESS',
  'BACKLOG',
  'DONE',
  'ARCHIVED',
] as const;
export type TaskStatus = (typeof TASK_STATUSES)[number];

export class TaskValidationError extends TaskDomainError {
  public readonly code = 'TASK_VALIDATION';
  public constructor(
    public readonly field: string,
    message: string,
  ) {
    super(message);
  }
}
```

- [ ] **Step 4: Implement task normalization and `createTask`**

```ts
export function createTask(input: CreateTaskInput, now: string): Task {
  const createdAt = validateIsoTimestamp(now, 'now');
  return {
    id: required(input.id, 'id', 100),
    title: required(input.title, 'title', 300),
    description: optional(input.description, 'description', 10_000),
    status: 'INBOX',
    priority: priority(input.priority),
    workspace: optional(input.workspace, 'workspace', 255),
    sourceContext: optional(input.sourceContext, 'sourceContext', 1_000),
    createdByType: creatorType(input.createdByType),
    createdByName: creatorName(input.createdByType, input.createdByName),
    createdAt,
    updatedAt: createdAt,
    startedAt: null,
    completedAt: null,
    archivedAt: null,
  };
}
```

- [ ] **Step 5: Expand and run creation tests**

Test exact boundaries, trimming, empty optional values, invalid creator combinations and priorities, and the full valid input. Run: `pnpm test -- tests/unit/domain/task/task.test.ts`.

Expected: PASS.

- [ ] **Step 6: Write failing rehydration tests**

```ts
expect(() => rehydrateTask({ ...validTask, status: 'DONE', completedAt: null })).toThrow(
  TaskValidationError,
);
expect(rehydrateTask(validTask)).toEqual(validTask);
```

- [ ] **Step 7: Implement `rehydrateTask`**

Validate every persisted field, reject unsupported literals and inconsistent timestamp/status combinations, and return a validated complete object without generating values or rewriting valid persisted strings.

- [ ] **Step 8: Run rehydration tests**

Run: `pnpm test -- tests/unit/domain/task/task.test.ts`.

Expected: PASS, including valid/invalid status-time combinations and ISO timestamp validation.

### Task 2: Explicit lifecycle transitions

**Files:**

- Create: `src/domain/task/task-lifecycle.ts`
- Create: `tests/unit/domain/task/task-lifecycle.test.ts`

**Interfaces:**

- Consumes: `Task`, `TaskStatus`, `TaskTransitionError`, `TaskArchivedError`.
- Produces: `moveTaskToInbox(task, now)`, `activateTask(task, now)`, `startTask(task, now)`, `moveTaskToBacklog(task, now)`, `completeTask(task, now)`, and `archiveTask(task, now)`.

- [ ] **Step 1: Write table-driven failing transition tests**

```ts
test.each([
  ['INBOX', 'ACTIVE', activateTask],
  ['ACTIVE', 'IN_PROGRESS', startTask],
  ['DONE', 'ARCHIVED', archiveTask],
] as const)('%s can move to %s', (from, expected, operation) => {
  expect(operation(taskAt(from), NOW)).toMatchObject({ status: expected, updatedAt: NOW });
});
```

- [ ] **Step 2: Run lifecycle tests to verify they fail**

Run: `pnpm test -- tests/unit/domain/task/task-lifecycle.test.ts`

Expected: FAIL because lifecycle exports do not exist.

- [ ] **Step 3: Implement a private transition table and helper**

```ts
const ALLOWED_TARGETS: Readonly<Record<TaskStatus, readonly TaskStatus[]>> = {
  INBOX: ['ACTIVE', 'BACKLOG', 'ARCHIVED'],
  ACTIVE: ['INBOX', 'IN_PROGRESS', 'BACKLOG', 'DONE', 'ARCHIVED'],
  IN_PROGRESS: ['ACTIVE', 'BACKLOG', 'DONE', 'ARCHIVED'],
  BACKLOG: ['INBOX', 'ACTIVE', 'ARCHIVED'],
  DONE: ['ARCHIVED'],
  ARCHIVED: [],
};
```

Validate `now`; return the original object for same-state requests; reject archived operations with `TaskArchivedError` and other illegal moves with `TaskTransitionError`; apply the specified `startedAt`, `completedAt`, `archivedAt`, and `updatedAt` rules.

- [ ] **Step 4: Expand lifecycle tests and run them**

Cover every allowed and disallowed table entry, same-state no-ops, re-entering `IN_PROGRESS`, completion without start, archive preservation of completion, invalid clocks, immutability, reopening, and restoring. Run: `pnpm test -- tests/unit/domain/task/task-lifecycle.test.ts`.

Expected: PASS.

### Task 3: Metadata editing and documentation

**Files:**

- Modify: `src/domain/task/task.ts`
- Modify: `tests/unit/domain/task/task.test.ts`
- Modify: `src/domain/README.md`

**Interfaces:**

- Consumes: normalized task-field helpers and `TaskArchivedError`.
- Produces: `editTask(task, changes, now): Task`, accepting only title, description, priority, workspace, and source context.

- [ ] **Step 1: Write failing editing tests**

```ts
expect(editTask(task, { title: ' Revised ' }, NOW)).toMatchObject({
  title: 'Revised',
  updatedAt: NOW,
});
expect(editTask(task, { title: task.title }, NOW)).toBe(task);
expect(() => editTask(archivedTask, { title: 'No' }, NOW)).toThrow(TaskArchivedError);
```

- [ ] **Step 2: Run the focused test to verify it fails**

Run: `pnpm test -- tests/unit/domain/task/task.test.ts`

Expected: FAIL because editing is not yet implemented.

- [ ] **Step 3: Implement `editTask`**

Normalize only the five editable fields, preserve every immutable/provenance/lifecycle field, return the original task if normalized values are identical, otherwise return a new task with `updatedAt` set to validated `now`.

- [ ] **Step 4: Update domain documentation**

Replace the deferral note with the domain module's responsibility, its dependency boundary, and its explicit task lifecycle API.

- [ ] **Step 5: Run focused domain tests**

Run: `pnpm test -- tests/unit/domain/task`

Expected: PASS.

### Task 4: Quality verification and review

**Files:**

- Verify: `src/domain/task/*.ts`, `tests/unit/domain/task/*.test.ts`, `src/domain/README.md`

- [ ] **Step 1: Format and inspect changes**

Run: `pnpm exec prettier --write src/domain/task tests/unit/domain/task src/domain/README.md docs/superpowers/plans/2026-07-25-task-domain-model.md` and inspect `git diff --check`.

- [ ] **Step 2: Run required quality gates**

Run: `pnpm test -- tests/unit/domain/task`, `pnpm typecheck`, `pnpm lint`, and `pnpm verify`.

Expected: all commands pass.

- [ ] **Step 3: Manually review lifecycle constraints**

Confirm the source contains only intent-specific public transitions, uses the exact transition table, has no adapter imports or generic setters, and timestamp tests cover every lifecycle semantic.
