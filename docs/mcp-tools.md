# Relay MCP Tool Contracts

This document is reserved by issue #19 and is governed by `docs/decisions/0002-agent-integration-contracts.md` and `docs/superpowers/plans/2026-07-26-agent-integration-contracts.md`.

Production MCP tools are implemented by issues #20 and #21. Issue #19 defines the approved names, versioning, error model, task representation, session semantics, and result envelopes before those handlers are written.

Canonical tool names:

- `task_capture`
- `task_list`
- `task_get`
- `task_find_similar`
- `session_captures_list`
- `task_edit`
- `task_triage`
- `task_start`
- `task_complete`
- `task_archive`

Do not add an unrestricted generic task update or status mutation tool.
