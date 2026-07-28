---
name: relay-session-review
description: Use when preparing final completion or when the user asks to wrap up, review, or show Relay tasks captured in the active agent session.
---

# Relay Session Review

## Purpose

Before final completion, review every Relay task captured with the exact active session ID. Present captures compactly, distinguish pre-existing duplicate candidates, and mutate only on explicit user direction.

## When to review

Always perform the exact active-session lookup before final completion, even when the agent believes no captures exist. A user-triggered wrap-up or review is an additional trigger, not a replacement. Never infer completion from a timer, inactivity, or process exit.

## Session lookup

Use `session_captures_list` with the exact active session ID, or the documented source-checkout CLI `session captures --session <id> --output json` fallback. Relay's ordered result is authoritative: an empty result is valid, and completed and archived captures must be included alongside INBOX tasks. Never query a guessed session or mix tasks from another session ID.

## Review presentation

Present returned captures with ID, title, and current status. Label duplicate candidates separately as pre-existing unless the exact-session query also returned them. Do not reconstruct captures from remembered IDs or timestamps.

## User-directed actions

Obtain explicit user direction for each selected task. Use only intent-specific capabilities: `task_edit`, `task_triage`, `task_start`, `task_complete`, or `task_archive`. Report `NO_CHANGE`, conflicts, archived-task restrictions, and errors accurately; never invent success.

## Unresolved captures

Do not mutate unselected tasks. Unresolved captures remain in `INBOX`.

## Adapter selection

Keep the adapter used for capture unless it is concretely unavailable. MCP is preferred; CLI fallback always uses `--output json` and parses structured output only.

## Prohibited behaviour

Never omit the exact-session lookup before final completion, even when the agent believes no captures exist. Treat an empty authoritative result as valid. Never query a guessed session, reconstruct captures from memory or timestamps, silently apply dispositions, use a generic status mutation, hide completed or archived captures returned by Relay, or infer completion from a timer, inactivity, or process exit.

See [MCP tool contracts](../../docs/mcp-tools.md), [CLI contract reference](../../docs/cli-reference.md), and [session semantics](../../docs/session-semantics.md).
