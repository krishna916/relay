# Relay CLI Contract Reference

The source-checkout CLI is a built Node entry point at `dist/cli/main.js`. It supports ten task/session commands and always uses JSON mode.

## Build and invoke

From the repository root:

```bash
pnpm build:node
```

Invoke the built file with an absolute path from any working directory:

```bash
RELAY_DB_PATH=/tmp/relay.db node /absolute/path/to/relay/dist/cli/main.js task list --output json
```

On Windows PowerShell:

```powershell
$env:RELAY_DB_PATH = 'C:\temp\relay.db'
node C:\absolute\path\to\relay\dist\cli\main.js task list --output json
```

`RELAY_DB_PATH` selects the SQLite database. If it is blank or unset, Relay uses the platform default from `src/database/database-config.ts`. The working directory does not affect storage or migration lookup.

The CLI calls `TaskApplication` directly. It never starts an HTTP server or MCP process and does not access SQLite from the adapter.

## JSON protocol

Every command requires the exact option `--output json`. Stdout contains exactly one JSON document followed by one newline. Success writes no stderr; failures write one public JSON failure envelope to stdout and one human-readable diagnostic to stderr. Stack traces, SQL, secrets, and local paths are not part of the public error contract.

Success envelope:

```json
{ "schemaVersion": 1, "ok": true, "data": {}, "warnings": [] }
```

Failure envelope:

```json
{
  "schemaVersion": 1,
  "ok": false,
  "error": { "code": "VALIDATION_ERROR", "message": "A task id is required." }
}
```

Duplicate detection during capture is advisory. A duplicate warning is included in `warnings`, but the command still succeeds with exit code `0`.

## Commands and options

Options shown as required must appear exactly once. Options shown as repeatable may appear more than once. Unknown options and positional arguments are usage errors.

### `task capture`

Required: `--title TEXT`, `--agent NAME`, `--session ID`, `--output json`.

Optional: `--description TEXT`, `--priority LOW|NORMAL|HIGH`, `--workspace NAME`, `--source-context TEXT`.

Creates an `AGENT` task, performs an advisory similar-task lookup first, and preserves agent, session, workspace, and source context.

### `task list`

Required: `--output json`.

Optional: repeatable `--status INBOX|ACTIVE|IN_PROGRESS|BACKLOG|DONE|ARCHIVED`, `--workspace NAME`, and `--limit INTEGER` from `1` through `100`.

Without `--status`, all task statuses are selected. The default limit is `100`.

### `task get ID`

Required: a task `ID` and `--output json`.

No other options are accepted.

### `task find-similar`

Required: `--title TEXT`, `--output json`.

Optional: `--workspace NAME` and `--limit INTEGER` from `1` through `5`. The default limit is `5`.

### `task edit ID`

Required: a task `ID`, at least one edit operation, and `--output json`.

Editable values: `--title TEXT`, `--description TEXT`, `--priority LOW|NORMAL|HIGH`, `--workspace NAME`, and `--source-context TEXT`.

Clear flags: `--clear-description`, `--clear-priority`, `--clear-workspace`, and `--clear-source-context`. A value and its matching clear flag cannot be supplied together. Empty strings are rejected rather than interpreted as clears. A no-op edit is valid when an edit operation is supplied and returns `change.action` `NO_CHANGE`.

### `task triage ID`

Required: a task `ID`, `--to INBOX|ACTIVE|BACKLOG`, and `--output json`.

No other options are accepted. Triage uses the corresponding focused application mutation.

### `task start ID`, `task complete ID`, and `task archive ID`

Required: a task `ID` and `--output json`.

No other options are accepted. Each command calls its matching lifecycle method and returns `STARTED`, `COMPLETED`, or `ARCHIVED` change metadata, or `NO_CHANGE` for an idempotent operation.

### `session captures`

Required: `--session ID` and `--output json`.

Optional: `--limit INTEGER` from `1` through `100`; the default is `100`.

Returns captured AGENT tasks for the session.

## Exit codes

| Exit code | Meaning                              | Error code                  |
| --------: | ------------------------------------ | --------------------------- |
|       `0` | Success, warnings, or approved no-op | —                           |
|       `1` | Unexpected internal failure          | `INTERNAL_ERROR`            |
|       `2` | Usage or validation failure          | `VALIDATION_ERROR`          |
|       `3` | Task was not found                   | `NOT_FOUND`                 |
|       `4` | Conflict or archived-task operation  | `CONFLICT`, `ARCHIVED_TASK` |
|       `5` | Storage or persistence failure       | `STORAGE_ERROR`             |

The CLI intentionally excludes HTTP calls, MCP process spawning, direct SQLite access, publication, installers, setup/doctor/update commands, shell completion, TUI work, and vendor-specific assets.
