# Relay MCP Tool Contracts

Issue #21 adds five intent-specific mutation handlers to the version `1` contract alongside the issue #26 capture/read handlers. Tool discovery exposes strict input schemas: malformed request shapes (including unknown, forbidden, missing, or out-of-range fields) receive SDK-native MCP `InvalidParams` (`-32602`) before application execution. Schema-valid tool execution returns structured `{ schemaVersion: 1, data, warnings }`; execution errors use stable Relay codes without stack traces, SQLite details, secrets, or local paths. Compact text is a compatibility supplement, never a parsing requirement.

## `task_capture`

Input: required `title`, `createdByName`, and `sessionId`; optional `description`, `priority`, `workspace`, and `sourceContext`. The adapterâ€”not the callerâ€”sets `createdByType: AGENT` and `status: INBOX`; caller-supplied provenance or status is invalid. Output: `{ task, change: { action: "CREATED" } }`, with optional advisory `POSSIBLE_DUPLICATE` warnings. Capture always succeeds when a duplicate warning is returned.

## `task_list`

Input: optional non-empty, non-duplicated `statuses`; optional `workspace`; and `limit` from 1 through 100. Output: `{ tasks, count }`. This is a bounded read and has no lifecycle side effects.

## `task_get`

Input: required non-empty task ID. Output: `{ task }`. A missing ID maps to `NOT_FOUND`.

## `task_find_similar`

Input: required `title`, optional `workspace`, and `limit` from 1 through 5 (default 5). Output: `{ candidates }`, where each candidate carries a task and stable `matchReason`. Matching is bounded, normalized-title based, non-archived, and advisory; it never merges or changes tasks.

## `session_captures_list`

Input: required valid `sessionId` and `limit` from 1 through 100. Output: `{ sessionId, tasks, count }`. It selects only agent-created tasks with an exact persisted ID, includes completed and archived tasks, and orders by `createdAt ASC, id ASC`.

## `task_edit`

Input: task ID plus one or more editable task fields or explicit clear flags. MCP `null` is rejected; explicit `clear*` flags are the only clear operation, and a value cannot accompany its matching flag. Output: `{ task, change }`, including `NO_CHANGE` for an approved no-op. `sessionId`, provenance, status, and lifecycle timestamps are never editable.

`change` is `{ action: "EDITED" | "NO_CHANGE", fields }`. `fields` lists only persisted editable fields that changed, in stable order: `title`, `description`, `priority`, `workspace`, `sourceContext`.

The editable fields are `title`, `description`, `priority`, `workspace`, and `sourceContext`. Nullable fields are cleared only with `clearDescription`, `clearPriority`, `clearWorkspace`, or `clearSourceContext`; direct `null` and value-plus-clear requests are invalid params. A normalized value that is already persisted returns `change: { action: "NO_CHANGE", fields: [] }` without a persistence write.

## `task_triage`

Input: task ID and target `INBOX`, `ACTIVE`, or `BACKLOG`. Output: `{ task, change }`. `IN_PROGRESS`, `DONE`, and `ARCHIVED` have their own intent-specific tools.

`change` is `{ action: "TRIAGED" | "NO_CHANGE", from, to }`; `from` and `to` are the persisted source and result statuses.

## `task_start`

Input: task ID. Output: `{ task, change: { action: "STARTED" | "NO_CHANGE" } }`. It performs only the focused start lifecycle operation.

## `task_complete`

Input: task ID. Output: `{ task, change: { action: "COMPLETED" | "NO_CHANGE" } }`. It performs only the focused completion lifecycle operation.

## `task_archive`

Input: task ID. Output: `{ task, change: { action: "ARCHIVED" | "NO_CHANGE" } }`. It performs only the focused archive lifecycle operation.

All lifecycle mutations return `change.action = "NO_CHANGE"` when the focused operation leaves the persisted task unchanged, without changing timestamps or writing the repository. Invalid lifecycle transitions use `CONFLICT`; attempting a restricted mutation of an archived task uses `ARCHIVED_TASK`. Other schema-valid execution failures map to `VALIDATION_ERROR`, `NOT_FOUND`, `STORAGE_ERROR`, or generic `INTERNAL_ERROR`; internal messages are never exposed.

## Mutation safety and versioning

Invoke `task_edit`, `task_triage`, `task_start`, `task_complete`, and `task_archive` only after explicit user direction in the active conversation. Relay validates data and lifecycle legality but cannot authenticate conversational intent under the OS-user trust boundary, so it intentionally has no fake `confirmed`, `requestedBy`, or copied-user-text field.

The MCP SDK owns schema-invalid input handling (`InvalidParams`, `-32602`). Relay owns errors after a schema-valid request reaches the application and returns the structured versioned error envelope. Each mutation invokes one focused application operation; MCP does not read SQLite or implement lifecycle legality.

There is no `task_update`, `task_set_status`, generic CRUD mutation, or unrestricted lifecycle command. Tool names are not version-prefixed; a breaking change requires a new integer schema version and an explicit compatibility decision. Later issues implement every handler through shared application services; MCP never reads SQLite directly.
