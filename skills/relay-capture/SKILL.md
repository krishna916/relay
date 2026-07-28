---
name: relay-capture
description: Use when concrete follow-up work is discovered while performing another task and Relay is available through MCP or its deterministic CLI.
---

# Relay Capture

## Purpose

Capture a concrete, actionable follow-up without derailing the current activity. Relay capabilities perform persistence and validation; this skill governs agent behaviour.

## When to capture

Capture work discovered during another task when it is concrete, independently actionable, safely deferrable, and should persist beyond the current response. Do not capture speculative ideas, vague reminders, work already being completed, or status notes.

## Adapter selection

MCP is preferred for supported interactive clients. CLI is the deterministic fallback for unsupported clients, scripts, debugging, or explicit one-shot use. Keep the same adapter for one workflow unless it fails or becomes unavailable. In CLI mode, use `--output json` and parse only JSON, never decorative terminal output. MCP and CLI use the same Relay database and contracts.

## Session and provenance

Generate one valid opaque session ID for the active agent session or reuse its already-established ID. Retain that exact session ID for every capture and final review; never reuse it across unrelated concurrent agents or shells. Provide a concise title, agent name, exact session ID, workspace when known, and limited source context.

## Capture procedure

1. Decide that the follow-up is concrete and actionable.
2. When practical, use `task_find_similar` or the matching CLI command before capture.
3. Use `task_capture`, or the documented source-checkout CLI invocation for `task capture --output json`; do not supply status or provenance fields.
4. Retain the returned task ID and warnings, then continue the original work without separately interrupting the user after every capture.

## Duplicate handling

Duplicate candidates are advisory. Do not suppress capture solely because a candidate exists, and do not merge or mutate existing tasks unless the user explicitly directs it.

## Context safety

Store only concise source context that identifies where or why the work was found. Never store prompts, transcripts, source files, secrets, credentials, tokens, large stack traces, logs, or oversized copied context.

## Autonomy boundaries

An agent may autonomously create only a new Relay task in `INBOX`. It must not edit, triage, start, complete, archive, delete, merge, or move any task, including a new capture, without explicit user direction in the active conversation.

## Do not capture

Do not capture every thought, casual ideas, or anything that cannot be acted on later without reconstructing the conversation.

See [MCP tool contracts](../../docs/mcp-tools.md), [CLI contract reference](../../docs/cli-reference.md), and [session semantics](../../docs/session-semantics.md).
