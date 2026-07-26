# Relay MCP Tool Contracts

Issue #19 defines this version `1` contract only. It does not implement production MCP task handlers. Every tool returns structured `{ schemaVersion: 1, data, warnings }`; errors use `VALIDATION_ERROR`, `NOT_FOUND`, `CONFLICT`, `ARCHIVED_TASK`, `STORAGE_ERROR`, or `INTERNAL_ERROR` without stack traces, SQLite details, secrets, or local paths. Compact text is a compatibility supplement, never a parsing requirement.

## `task_capture`

Input: required `title`, `createdByName`, and `sessionId`; optional `description`, `priority`, `workspace`, and `sourceContext`. The adapter—not the caller—sets `createdByType: AGENT` and `status: INBOX`; caller-supplied provenance or status is invalid. Output: `{ task, change: { action: "CREATED" } }`, with optional advisory `POSSIBLE_DUPLICATE` warnings. Capture always succeeds when a duplicate warning is returned.

## `task_list`

Input: optional non-empty `statuses`, `workspace`, and `limit` from 1 through 100. Output: `{ tasks, count }`. This is a bounded read and has no lifecycle side effects.

## `task_get`

Input: required non-empty task ID. Output: `{ task }`. A missing ID maps to `NOT_FOUND`.

## `task_find_similar`

Input: required `title`, optional `workspace`, and `limit` from 1 through 5 (default 5). Output: `{ candidates }`, where each candidate carries a task and stable `matchReason`. Matching is bounded, normalized-title based, non-archived, and advisory; it never merges or changes tasks.

## `session_captures_list`

Input: required valid `sessionId` and `limit` from 1 through 100. Output: `{ sessionId, tasks, count }`. It selects only agent-created tasks with an exact persisted ID, includes completed and archived tasks, and orders by `createdAt ASC, id ASC`.

## `task_edit`

Input: task ID plus one or more editable task fields or explicit clear flags. Output: `{ task, change }`, including `NO_CHANGE` for an approved no-op. `sessionId`, provenance, status, and lifecycle timestamps are never editable.

## `task_triage`

Input: task ID and target `INBOX`, `ACTIVE`, or `BACKLOG`. Output: `{ task, change }`. `IN_PROGRESS`, `DONE`, and `ARCHIVED` have their own intent-specific tools.

## `task_start`

Input: task ID. Output: `{ task, change }`. It performs only the focused start lifecycle operation.

## `task_complete`

Input: task ID. Output: `{ task, change }`. It performs only the focused completion lifecycle operation.

## `task_archive`

Input: task ID. Output: `{ task, change }`. It performs only the focused archive lifecycle operation.

## Mutation safety and versioning

Invoke `task_edit`, `task_triage`, `task_start`, `task_complete`, and `task_archive` only after explicit user direction in the active conversation. Relay validates data and lifecycle legality but cannot authenticate conversational intent under the OS-user trust boundary, so it intentionally has no fake `confirmed`, `requestedBy`, or copied-user-text field.

There is no `task_update`, `task_set_status`, generic CRUD mutation, or unrestricted lifecycle command. Tool names are not version-prefixed; a breaking change requires a new integer schema version and an explicit compatibility decision. Later issues implement every handler through shared application services; MCP never reads SQLite directly.
