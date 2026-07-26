# Relay Session Semantics

Issue #19 defines `sessionId` as an opaque caller-generated identifier stored as task metadata.

- No session table is introduced in Epic #2.
- Agent capture requires a valid session ID.
- MCP and CLI callers reuse the same ID for captures and final review.
- Concurrent sessions use distinct IDs.
- Session review selects agent-created tasks whose persisted `sessionId` exactly matches the requested ID.
- Completed and archived tasks remain visible in session review.
- Results are ordered by `createdAt ASC, id ASC`.
- Session completion is never inferred through timers, inactivity, or process lifetime.

Validation:

- trim surrounding whitespace
- length 1–128 characters
- allowed characters: ASCII letters, digits, `.`, `_`, `:`, `-`

The production task-model, migration, repository, and application changes are implemented downstream under issue #20.
