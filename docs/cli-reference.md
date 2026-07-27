# Relay CLI Contract Reference

Issue #19 reserves a deterministic, versioned CLI contract. Production command handlers are implemented later; the stable executable surface is one `relay` command:

```text
relay mcp
relay ui
relay doctor
relay task ...
relay session ...
```

`relay-mcp` may remain as a compatibility entry point, but new integrations target `relay mcp`.

## Source-checkout invocation

Build the project, then invoke `node dist/cli/main.js` from any directory. Set `RELAY_DB_PATH` when an explicit database location is needed:

```text
RELAY_DB_PATH=/tmp/relay.db node /path/to/relay/dist/cli/main.js task list --output json
```

The task and session commands below call `TaskApplication` directly. They never start HTTP or MCP processes.

## JSON protocol

Every agent-facing command accepts `--output json`. JSON mode writes one JSON document followed by a newline to stdout; diagnostics are written to stderr. No caller needs to parse decorative output.

```json
{ "schemaVersion": 1, "ok": true, "data": {}, "warnings": [] }
```

Error details are optional and never expose SQL, stacks, secrets, or local paths.

```json
{
  "schemaVersion": 1,
  "ok": false,
  "error": { "code": "VALIDATION_ERROR", "message": "sessionId has an invalid format" }
}
```

| Exit code | Meaning                              | Error codes                 |
| --------- | ------------------------------------ | --------------------------- |
| 0         | Success, warnings, or approved no-op | —                           |
| 1         | Unexpected internal failure          | `INTERNAL_ERROR`            |
| 2         | Usage or validation failure          | `VALIDATION_ERROR`          |
| 3         | Task absent                          | `NOT_FOUND`                 |
| 4         | Invalid lifecycle operation          | `CONFLICT`, `ARCHIVED_TASK` |
| 5         | Storage failure                      | `STORAGE_ERROR`             |

## Commands

| Command                    | Required arguments                          | Optional arguments                                                                | Result                                                          |
| -------------------------- | ------------------------------------------- | --------------------------------------------------------------------------------- | --------------------------------------------------------------- |
| `relay task capture`       | `--title`, `--agent`, `--session`           | `--description`, `--priority`, `--workspace`, `--source-context`, `--output json` | `{ task, change: { action: "CREATED" } }` and optional warnings |
| `relay task list`          | —                                           | repeatable `--status`, `--workspace`, `--limit 1..100`, `--output json`           | `{ tasks, count }`                                              |
| `relay task get <id>`      | ID                                          | `--output json`                                                                   | `{ task }`                                                      |
| `relay task find-similar`  | `--title`                                   | `--workspace`, `--limit 1..5`, `--output json`                                    | `{ candidates }`                                                |
| `relay session captures`   | `--session`                                 | `--limit 1..100`, `--output json`                                                 | `{ sessionId, tasks, count }`                                   |
| `relay task edit <id>`     | ID and an editable field                    | clear flags and `--output json`                                                   | `{ task, change }`                                              |
| `relay task triage <id>`   | ID and `--to INBOX`, `ACTIVE`, or `BACKLOG` | `--output json`                                                                   | `{ task, change }`                                              |
| `relay task start <id>`    | ID                                          | `--output json`                                                                   | `{ task, change }`                                              |
| `relay task complete <id>` | ID                                          | `--output json`                                                                   | `{ task, change }`                                              |
| `relay task archive <id>`  | ID                                          | `--output json`                                                                   | `{ task, change }`                                              |

Editing accepts existing editable fields only. Clear nullable fields with explicit flags such as `--clear-description`; empty strings and MCP `null` values are rejected rather than treated as clearing requests. A value and its corresponding clear flag cannot be supplied together. `task triage` excludes `IN_PROGRESS`, `DONE`, and `ARCHIVED`, because those transitions have dedicated intent-specific commands.

CLI commands call application services and reuse `src/database/database-config.ts`; they never access SQLite directly. Database path precedence is explicit command/injected path, non-blank `RELAY_DB_PATH`, then the platform default. The working directory is never production storage configuration.
