# Relay: Initial Product and Architecture Decision

**Status:** Accepted  
**Date:** 2026-07-24

## Summary

Relay will be a lightweight, local-only personal work queue designed to operate alongside AI-assisted development workflows.

It is not intended to replace team or long-term task-management systems such as Jira, Linear, Todoist, or Horizon. Its primary purpose is to capture and surface short-lived, ad hoc personal tasks without requiring the user to leave an active coding workspace.

The defining integration is an MCP server that allows AI agents such as Codex and Claude Code to interact with the same local task store as the user.

## Problem

During AI-assisted development, follow-up work is frequently discovered inside an agent session. Recording that work in an external task manager interrupts the workflow and requires context switching.

Existing task-manager MCP integrations partly address this, but they remain coupled to broader cloud products and can feel cumbersome for local, transient work.

Relay should make this workflow natural:

1. An AI agent discovers follow-up work during a session.
2. The agent captures it locally without interrupting the user.
3. At the end of the session, the agent surfaces the captured items.
4. The user decides what should happen next.

## Product Scope

### In scope

- Single-user personal task tracking
- Local SQLite persistence
- Ad hoc and day-to-day work items
- Persistent open tasks that remain visible until explicitly handled
- MCP access for AI agents
- Automatic capture of tasks discovered by agents
- End-of-session review of agent-captured tasks
- User-directed triage and disposition
- A lightweight local UI for reviewing and managing tasks
- Optional CLI access

### Out of scope

- Team collaboration
- User accounts and permissions
- Cloud synchronization
- Mobile applications
- Multi-device conflict resolution
- Long-term project planning
- Replacing Jira, Linear, Todoist, or Horizon
- Comments, mentions, assignments, or shared workspaces
- Complex recurring tasks and reminders
- Productivity analytics
- Kanban and advanced project-management views

## Default Task Behaviour

Relay uses a persistent lightweight queue.

A task remains open and visible until the user or an explicitly instructed agent:

- completes it,
- moves it to the backlog,
- archives it, or
- otherwise updates its state.

Tasks do not disappear at the end of the day and are not automatically moved based on age.

The main UI may be called **Today**, but the internal active state should not imply that a task belongs exclusively to one calendar date.

## Initial Task States

- `INBOX`: captured but not yet triaged
- `ACTIVE`: currently relevant and visible in the primary Today view
- `IN_PROGRESS`: actively being worked on
- `BACKLOG`: valid but not currently active
- `DONE`: completed
- `ARCHIVED`: retained but hidden from normal views

Additional workflow states such as `WAITING`, `BLOCKED`, and `SOMEDAY` are intentionally deferred. Notes or lightweight metadata can cover these cases until a demonstrated need exists.

## Agent Autonomy Model

### Agents may do automatically

- Capture newly discovered tasks
- Store captured tasks in `INBOX`
- Attach the originating agent and workspace context
- List and retrieve tasks
- Check for likely duplicate open tasks

### Agents must not do autonomously

- Move captured tasks into `ACTIVE` or `BACKLOG`
- Mark tasks complete
- Archive tasks
- Permanently delete tasks
- Materially rewrite existing tasks

Those actions require an explicit user instruction.

### Review timing

Agent-created tasks should not interrupt the user as they are discovered.

Agents should collect them during the working session and surface a compact review before their final session summary, or when the user explicitly requests a wrap-up or captured-task review.

The application itself will not attempt to infer when an AI session has ended. End-of-session surfacing is an integration behaviour expected from the consuming agent.

## Initial Data Model

The first version should keep the task model small:

```text
Task
- id
- title
- description
- status
- priority
- workspace
- source_type
- source_name
- source_context
- created_at
- updated_at
- started_at
- completed_at
- archived_at
```

### Metadata guidance

- `workspace` identifies the local context or repository associated with the task.
- `source_type` distinguishes manual and agent-created tasks.
- `source_name` may contain values such as `codex`, `claude-code`, or `manual`.
- `source_context` should be a brief human-readable reference, not a copy of the full prompt, conversation, or source code.

Subtasks, task hierarchies, custom fields, and separate day-plan entities are deferred.

## MCP Contract Direction

MCP tools should be explicit rather than exposing a generic command executor.

Likely initial tools:

- `task_capture`
- `task_get`
- `task_list`
- `task_search`
- `task_triage`
- `task_start`
- `task_complete`
- `task_archive`
- `task_review_captures`

Tool descriptions and server instructions must clearly communicate the autonomy rules. Mutation tools other than capture should require explicit user intent.

Mutating tools should return the complete updated task and a concise description of the performed change.

## Duplicate Handling

Before creating an agent-discovered task, Relay may check for similar open tasks in the same workspace.

The first version should use simple normalized-title matching or lightweight text similarity. It should return a possible duplicate warning rather than silently merging tasks.

Embeddings and semantic search are explicitly deferred.

## Technology Decision

Relay will use:

- TypeScript
- Node.js LTS
- The official MCP TypeScript SDK
- SQLite
- `better-sqlite3`
- Zod for input and tool-schema validation
- React with TypeScript and Vite for the local UI

## Runtime Architecture

Relay should avoid an independently running background daemon in the first version.

```text
                         SQLite
                            ^
                            |
          +-----------------+-----------------+
          |                 |                 |
     MCP process        CLI command       UI process
     stdio-based        short-lived       on demand
```

### MCP

The MCP process is launched and owned by the MCP client, normally using stdio. It remains alive only while the client requires it.

### CLI

CLI commands open the database, execute one operation, and exit.

### UI

The UI is launched on demand. A small local server may expose an HTTP API and serve the compiled React application while the UI is being used.

This architecture minimizes idle memory and CPU consumption while Relay runs alongside heavy enterprise development environments.

## Application Boundaries

The MCP server, CLI, and UI must share the same application services and domain rules.

None of the interface layers should implement task lifecycle rules or write directly to SQLite.

Suggested initial structure:

```text
src/
  domain/
  application/
  database/
  interfaces/
    mcp/
    cli/
    http/
  shared/

web/
```

A multi-package monorepo and speculative abstractions are not required initially.

## SQLite Operational Rules

The implementation should use:

- WAL journal mode
- Short transactions
- A configured busy timeout
- SQL-based migrations
- Stable task identifiers
- No long-held write transactions

An optimistic version column should only be introduced if concurrent editing becomes an observed problem.

## Deferred Decisions

The following decisions should be made only after the core MCP workflow is validated:

- Desktop packaging with Electron or Tauri
- Single-executable Node packaging
- Background startup on login
- Notifications and reminders
- Promotion or export to Todoist, Horizon, Jira, or other systems
- Rich daily history and work journaling
- Semantic duplicate detection
- Multiple workspaces with advanced configuration

## Success Criteria for the First Useful Version

Relay is useful when:

1. Codex or Claude Code can capture a discovered task without leaving the active workspace.
2. Captured tasks persist locally across sessions.
3. The agent can surface all tasks captured during its session at wrap-up.
4. The user can explicitly triage each captured task.
5. Active tasks remain visible until deliberately completed, deferred, or archived.
6. Relay adds negligible operational burden while running alongside a large development workspace.

## Decision Rationale

TypeScript and Node.js were selected over Java because this product prioritizes a small runtime footprint, fast startup, direct MCP integration, and a shared language across the backend and React UI.

Java could provide stronger runtime performance and structure, but those advantages are not material for a low-throughput local task queue. A conventional Java framework would add idle memory, startup, and packaging costs without corresponding product value.

The architecture remains intentionally evolutionary: SQLite and the application layer are authoritative, while MCP, CLI, and UI remain replaceable interfaces.
