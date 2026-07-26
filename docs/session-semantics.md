# Relay Session Semantics

`sessionId` is opaque caller-generated metadata on agent-created tasks. It is not a session table, aggregate, timer, or authentication mechanism.

## Identifier rules

- MCP clients and CLI callers generate IDs in the same namespace.
- Trim surrounding whitespace before validation.
- A valid ID has 1–128 ASCII letters, digits, `.`, `_`, `:`, or `-`.
- Agent capture and session-capture retrieval require a valid ID; malformed or missing input is `VALIDATION_ERROR`.
- Human tasks may have `sessionId: null`.

An agent reuses the same identifier while capturing and reviewing work in one active session. Different concurrent agents or shells use different IDs, so their capture groups remain isolated. Completion is initiated by the agent or user and is never persisted or inferred from process exit, timers, or inactivity.

## Deterministic capture membership

“Captured during this session” means a task was originally created with `createdByType = AGENT` and its persisted `sessionId` exactly equals the requested identifier. The query uses persisted metadata, not timestamps or process lifetime.

Session review includes captures in every lifecycle state, including `DONE` and `ARCHIVED`, and sorts them by `createdAt ASC, id ASC`.

## Downstream implementation boundary

Issue #19 documents `sessionId` in the external task representation and validates contract input only. Issue #20 adds the nullable domain/persistence field, migration, repository mapping, agent-capture application input, and session-capture query support. No production session storage or query handler is introduced here.
