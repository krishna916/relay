# Relay Agent Integration Contracts — Implementation Specification

## Status

Proposed implementation specification for GitHub issue #19.

This document defines the contract work required before production MCP and CLI task adapters are implemented. It does not implement production handlers.

## 1. Chosen Design

Relay exposes the same task capabilities through two thin adapters:

- MCP over stdio for schema-aware, persistent agent sessions.
- A short-lived CLI for one-shot invocation, fallback usage, debugging, and scripts.

Both adapters call shared application services. Neither adapter owns lifecycle rules or accesses SQLite directly.

The contract is versioned independently from the Relay package version using integer schema version `1`. MCP tool names are not prefixed with a version. Breaking changes require a new contract version and an explicit compatibility decision.

## 2. Locked Decisions

### 2.1 Canonical capabilities

| Capability | MCP tool | CLI command |
|---|---|---|
| Capture | `task_capture` | `relay task capture` |
| List | `task_list` | `relay task list` |
| Get | `task_get` | `relay task get <id>` |
| Find similar | `task_find_similar` | `relay task find-similar` |
| Session captures | `session_captures_list` | `relay session captures` |
| Edit | `task_edit` | `relay task edit <id>` |
| Triage | `task_triage` | `relay task triage <id>` |
| Start | `task_start` | `relay task start <id>` |
| Complete | `task_complete` | `relay task complete <id>` |
| Archive | `task_archive` | `relay task archive <id>` |

Do not expose generic CRUD or unrestricted status mutation.

### 2.2 Session model

`sessionId` is an opaque caller-generated identifier stored on agent-created tasks.

Rules:

- No separate session table or session aggregate in Epic #2.
- MCP clients and CLI callers generate the identifier.
- The same identifier is reused for every capture and final review query in one agent work session.
- MCP and CLI share one namespace.
- Concurrent sessions remain isolated by distinct identifiers.
- `sessionId` is required for agent capture.
- `sessionId` is required for session-capture retrieval.
- Human-created tasks may have `sessionId = null`.
- Session completion is never persisted or inferred.

Validation:

- Trim surrounding whitespace.
- Length: 1–128 characters.
- Allowed characters: ASCII letters, digits, `.`, `_`, `:`, and `-`.
- Reject malformed identifiers with `VALIDATION_ERROR`.

“Captured during this session” means:

- `createdByType = AGENT`
- `sessionId` exactly equals the requested identifier
- the task was originally created with that identifier

The query is based on persisted task metadata, not process lifetime or timestamps. Archived and completed tasks remain part of the session-capture result. Default ordering is `createdAt ASC, id ASC`.

### 2.3 Provenance

Agent capture requires:

- `createdByType = AGENT`, set by the adapter rather than accepted as a caller-controlled field.
- `createdByName`: required, trimmed, maximum 100 characters.
- `sessionId`: required.
- `workspace`: optional, existing maximum 255 characters.
- `sourceContext`: optional, existing maximum 1,000 characters.

MCP/CLI agent-capture contracts do not accept `createdByType` or an initial status. Capture always creates an agent task in `INBOX`.

Existing-task mutations cannot alter provenance or `sessionId`.

### 2.4 Mutation safety

Do not add a fake `confirmed: true`, `requestedBy: USER`, copied user text, or other unverifiable authorization field.

Relay cannot authenticate conversational intent because the operating-system user is the trust boundary and agent identity is provenance only. Such a field would provide ceremony without enforcement.

Instead:

- Mutation tool and command descriptions state the hard behavioural precondition: invoke only after explicit user direction in the active conversation.
- Companion skills enforce and demonstrate that policy.
- Mutations remain separate, intent-specific capabilities.
- Runtime validates data and lifecycle legality, not conversational authorization.
- Tests verify that no unrestricted mutation capability exists and that every mutation maps to a focused application use case.

This is behavioural safety, not access control.

### 2.5 Duplicate handling

Duplicate handling remains advisory.

`task_find_similar` performs bounded normalized-title matching among non-archived tasks, preferably within the same workspace when supplied.

Initial normalization:

- trim
- lowercase using locale-independent behaviour
- collapse internal whitespace to one space
- remove trailing `.`, `!`, or `?`

Return at most 5 candidates ordered by:

1. exact normalized-title match
2. same workspace
3. most recently updated
4. stable ID tie-breaker

No embeddings, edit-distance framework, FTS, or automatic merge.

`task_capture` may return duplicate warnings but still creates the task. A duplicate warning is not an error; CLI exit code remains `0`.

### 2.6 Database path

Reuse `src/database/database-config.ts`.

Precedence remains:

1. Explicit injected or command path.
2. `RELAY_DB_PATH` when non-blank.
3. Platform default.

Production storage must never resolve from the current working directory.

Do not replace current platform defaults in issue #19. MCP, CLI, HTTP, UI, tests, and migrations must call the same resolver.

### 2.7 Executable shape

The stable future-facing command is one executable:

```text
relay mcp
relay ui
relay doctor
relay task ...
relay session ...
```

Issue #19 defines this contract only. Source-checkout wrappers may use package scripts. Epic #18 publishes the executable.

The existing `relay-mcp` bin may remain temporarily for compatibility, but new documentation and later packaging target `relay mcp`.

## 3. Versioned Envelopes

### 3.1 CLI success

```json
{
  "schemaVersion": 1,
  "ok": true,
  "data": {},
  "warnings": []
}
```

Rules:

- `schemaVersion` is integer `1`.
- `data` contains the command-specific result.
- `warnings` is always present.
- Successful commands, including warnings or an approved no-op, exit `0`.
- JSON mode writes exactly one JSON document plus a trailing newline to stdout.
- Diagnostics go to stderr.

### 3.2 CLI error

```json
{
  "schemaVersion": 1,
  "ok": false,
  "error": {
    "code": "VALIDATION_ERROR",
    "message": "sessionId has an invalid format",
    "details": {
      "field": "sessionId"
    }
  }
}
```

`details` is optional and must not contain SQL text, stack traces, secrets, or local paths.

### 3.3 MCP results

Each MCP tool declares explicit Zod input and output schemas.

Return structured data using the SDK-supported structured result mechanism. Include compact JSON text content only where required for client compatibility. Clients must not parse human prose.

Tool output contains:

```text
schemaVersion: 1
data: <tool-specific result>
warnings: Warning[]
```

Unexpected internals become `INTERNAL_ERROR` without leaking implementation details.

## 4. Stable Error Model

Codes:

- `VALIDATION_ERROR`
- `NOT_FOUND`
- `CONFLICT`
- `ARCHIVED_TASK`
- `STORAGE_ERROR`
- `INTERNAL_ERROR`

CLI exit codes:

| Exit | Meaning |
|---|---|
| `0` | success, including warnings or approved no-op |
| `1` | unexpected internal error |
| `2` | command usage or validation error |
| `3` | task not found |
| `4` | lifecycle conflict or archived-task restriction |
| `5` | database/storage failure |

Error JSON carries the precise code; do not create an exit code for every domain error.

## 5. Command Contracts

All agent-facing commands support `--output json`. JSON is authoritative.

### `relay task capture`

Required:

- `--title <text>`
- `--agent <name>`
- `--session <id>`

Optional:

- `--description <text>`
- `--priority <existing repository priority literal>`
- `--workspace <text>`
- `--source-context <text>`
- `--output json`

Does not accept status or creator type.

Returns:

```text
{ task, change: { action: "CREATED" } }
```

### `relay task list`

Optional filters:

- repeatable `--status`
- `--workspace`
- `--limit`, bounded 1–100
- `--output json`

Returns `{ tasks, count }`.

### `relay task get <id>`

Returns `{ task }`.

### `relay task find-similar`

Required `--title`. Optional `--workspace`, `--limit` bounded 1–5.

Returns `{ candidates }` with a stable `matchReason`.

### `relay session captures`

Required `--session <id>`. Optional `--limit` bounded 1–100.

Returns `{ sessionId, tasks, count }` ordered by capture order.

### `relay task edit <id>`

Accept one or more existing editable fields only. Clearing nullable fields uses explicit flags such as `--clear-description` rather than ambiguous empty strings.

A no-op returns success with `change.action = "NO_CHANGE"`.

### `relay task triage <id>`

Required `--to <INBOX|ACTIVE|BACKLOG>`. `IN_PROGRESS`, `DONE`, and `ARCHIVED` use dedicated commands.

### `relay task start|complete|archive <id>`

Each maps to its focused application operation and returns `{ task, change }`.

## 6. External Task Representation

Use camelCase:

```text
id
title
description
status
priority
workspace
sourceContext
createdByType
createdByName
sessionId
createdAt
updatedAt
startedAt
completedAt
archivedAt
```

Timestamps remain normalized UTC ISO-8601 strings.

Adding `sessionId` requires later production changes across domain, migration, repository mapping, application inputs, and any full-task response mapping. Issue #19 documents the contract and may add contract-only types, but must not silently perform the production migration.

## 7. Required Deliverables for Issue #19

Create:

```text
docs/mcp-tools.md
docs/cli-reference.md
docs/session-semantics.md
docs/decisions/0002-agent-integration-contracts.md
src/interfaces/contracts/contract-version.ts
src/interfaces/contracts/error-contract.ts
src/interfaces/contracts/task-contract.ts
src/interfaces/contracts/session-contract.ts
src/interfaces/contracts/warning-contract.ts
tests/fixtures/contracts/*.json
```

Exact file split may follow current repository conventions, but adapter-neutral contracts belong outside `mcp/` and `cli/`.

Update as needed:

```text
scripts/validate-repository-assets.ts
README.md
vitest.config.ts
```

Do not replace the working `relay-mcp` entry point unless a backwards-compatible alias is added and tested.

## 8. Implementation Sequence for Luna

1. Read issue #19, Epic #2, the task domain, task application services, MCP scaffold, and database resolver.
2. Write the ADR first using the locked decisions above.
3. Add adapter-neutral constants/types for contract version, errors, warnings, task DTOs, and session validation.
4. Add pure validation helpers only where they represent shared contract logic; do not create production handlers.
5. Write MCP documentation with one section per tool.
6. Write the CLI reference with commands, flags, envelopes, exit codes, stdout/stderr rules, and examples.
7. Write session-semantics documentation.
8. Add representative JSON fixtures for success and failure envelopes.
9. Add tests that parse every fixture and validate constants, session format, error-to-exit mapping, triage targets, limits, and absence of unrestricted status commands.
10. Extend repository asset validation so required docs and fixtures cannot silently disappear.
11. Link the documents from README.
12. Run verification and record results in the PR.

Do not implement production MCP tools, CLI handlers, database migrations, duplicate queries, or companion skills.

## 9. Tests

Cover:

- accepted and rejected session IDs
- contract version constant
- every stable error code
- every exit-code mapping
- CLI success/error envelopes
- warning schema
- task DTO including nullable fields
- capture schema rejecting caller-controlled status and creator type
- mutation DTOs rejecting immutable/provenance fields
- triage target restriction
- list and duplicate limits
- all JSON fixtures
- no generic `task_update`, `task_set_status`, or equivalent capability
- every documented contract using schema version `1`

## 10. Verification

Run:

```bash
pnpm format
pnpm format:check
pnpm lint
pnpm typecheck
pnpm test
pnpm test:coverage
pnpm build
pnpm validate:assets
pnpm verify
```

`pnpm verify` must pass without mutating tracked files.

## 11. Human Review Checkpoints

1. Confirm session metadata does not require a session table.
2. Confirm mutation safety avoids fake confirmation fields.
3. Confirm exact command and tool names.
4. Confirm envelopes and exit codes are sufficient for agents.
5. Confirm downstream `sessionId` persistence work is visible and not accidentally included.
6. Confirm path resolution reuses the current shared resolver.
7. Confirm no production adapter or packaging behaviour entered this issue.

## 12. Downstream Required Changes

Issue #20 must explicitly include:

- nullable `sessionId` in task domain and persistence
- SQL migration and repository mapping
- agent capture application input
- session-capture query support
- bounded advisory duplicate lookup

Issue #22 consumes the same contract types and fixtures rather than redefining envelopes or errors.

Issue #25 proves cross-adapter parity using these fixtures.

## 13. Blocker Assessment

There is no blocker to implementing issue #19 because it is a contract and documentation gate.

There is one known downstream scope gap: the current task model has no `sessionId`, and current application services predate session queries and duplicate lookup. This specification records that work for issue #20 rather than hiding it inside the contract issue.
