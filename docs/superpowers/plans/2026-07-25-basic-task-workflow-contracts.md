# Basic Task Workflow Shared Contracts

This document records the contracts shared by issues #5 through #10. The detailed execution specifications remain in the respective issue comments.

## Task model

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

export const TASK_PRIORITIES = ['LOW', 'NORMAL', 'HIGH'] as const;
export type TaskPriority = (typeof TASK_PRIORITIES)[number];

export type TaskCreatorType = 'HUMAN' | 'AGENT';

export interface Task {
  readonly id: string;
  readonly title: string;
  readonly description: string | null;
  readonly status: TaskStatus;
  readonly priority: TaskPriority | null;
  readonly workspace: string | null;
  readonly sourceContext: string | null;
  readonly createdByType: TaskCreatorType;
  readonly createdByName: string | null;
  readonly createdAt: string;
  readonly updatedAt: string;
  readonly startedAt: string | null;
  readonly completedAt: string | null;
  readonly archivedAt: string | null;
}
```

All timestamps are UTC ISO-8601 strings produced with `Date#toISOString()`.

## Validation limits

- ID: trimmed, 1–100 characters.
- Title: trimmed, 1–300 characters.
- Description: optional, maximum 10,000 characters.
- Workspace: optional, maximum 255 characters.
- Source context: optional, maximum 1,000 characters.
- Creator name: optional, maximum 100 characters.
- Empty optional strings normalize to `null`.

## Lifecycle

| Current | Allowed targets |
|---|---|
| `INBOX` | `ACTIVE`, `BACKLOG`, `ARCHIVED` |
| `ACTIVE` | `INBOX`, `IN_PROGRESS`, `BACKLOG`, `DONE`, `ARCHIVED` |
| `IN_PROGRESS` | `ACTIVE`, `BACKLOG`, `DONE`, `ARCHIVED` |
| `BACKLOG` | `INBOX`, `ACTIVE`, `ARCHIVED` |
| `DONE` | `ARCHIVED` |
| `ARCHIVED` | none |

A transition to the current state is an idempotent no-op: return the unchanged task and do not modify `updatedAt`.

- First entry into `IN_PROGRESS` sets `startedAt`; later re-entry preserves it.
- Entry into `DONE` sets `completedAt`.
- Entry into `ARCHIVED` sets `archivedAt`.
- Completion does not imply the task was started.
- Reopening completed tasks and restoring archived tasks are out of scope.
- Metadata editing is allowed for every non-archived task, including `DONE`.

## HTTP contract

```text
POST   /api/tasks
GET    /api/tasks/:id
GET    /api/tasks?view=inbox|active|backlog|completed&limit=NUMBER
PATCH  /api/tasks/:id
POST   /api/tasks/:id/move-to-inbox
POST   /api/tasks/:id/activate
POST   /api/tasks/:id/start
POST   /api/tasks/:id/move-to-backlog
POST   /api/tasks/:id/complete
POST   /api/tasks/:id/archive
```

Successful single-task responses use `{ "task": TaskDto }`. List responses use `{ "tasks": TaskDto[] }`.

Error responses use:

```json
{
  "error": {
    "code": "MACHINE_READABLE_CODE",
    "message": "Human-readable message",
    "details": {}
  }
}
```

## Architectural constraints

- Domain code does not import SQLite, HTTP, MCP, React, or Zod.
- Application services depend on a repository port, clock, and ID generator.
- SQLite implements the repository port with explicit SQL.
- HTTP and future MCP adapters call the same application service.
- React accesses tasks only through the loopback HTTP API.
- No ORM, web framework, state-management framework, desktop shell, authentication, remote binding, or daemon is introduced.
