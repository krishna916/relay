# Domain Layer

Relay's dependency-free business rules live here. The task domain validates and
normalizes task values, performs immutable metadata edits, and exposes only
intent-specific lifecycle operations (`activate`, `start`, `complete`, and so
on). It does not import persistence, HTTP, MCP, React, or Zod.

`src/domain/task` is the authoritative source for task status, priority,
timestamps, validation errors, and lifecycle transition rules.
