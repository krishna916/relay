# Relay

The approved agent-integration contract is documented in the [decision record](docs/decisions/0002-agent-integration-contracts.md), [MCP tool reference](docs/mcp-tools.md), [CLI reference](docs/cli-reference.md), and [session semantics](docs/session-semantics.md). These are contract-only artifacts: production MCP and CLI task handlers remain downstream work.

Relay is a local task sidecar for human–AI workflows. The current MVP is usable through its local web UI and through five safe local stdio MCP task tools.

## Prerequisites and setup

- Node.js `24.x` (see `.nvmrc`)
- pnpm `10.2.0`, managed by Corepack

From a clean checkout:

```bash
corepack enable
nvm use
pnpm install --frozen-lockfile
pnpm verify
```

If you use `fnm`, `asdf`, or another version manager, select Node 24 before installing. `pnpm verify` is the authoritative non-mutating quality gate: it runs formatting, linting, TypeScript checks, coverage tests, builds, repository-asset validation, and a high-severity dependency audit.

## Run Relay

For local development, start the UI and API together:

```bash
pnpm dev:ui
```

The HTTP service listens only on `http://127.0.0.1:43110`; the Vite development UI is served at `http://127.0.0.1:5173` and proxies `/api` to that service. `RELAY_HTTP_PORT` can change the HTTP port when the default is already in use. Relay has no background daemon: stopping these processes stops the locally running application.

To build and run the production-style local server, which serves the compiled UI from `dist/web`, use:

```bash
pnpm build
node dist/http/main.js
```

To run the MCP server after building:

```bash
node dist/mcp/main.js
```

It exposes `relay_health`, `task_capture`, `task_list`, `task_get`, `task_find_similar`, and `session_captures_list`. MCP task results use structured schema-versioned payloads; capture records AGENT provenance and reports possible duplicates as advisory warnings.

## Database and safe development data

Relay uses a local SQLite database containing task data. The default database file is:

- Windows: `%APPDATA%\relay\relay.db`
- macOS: `~/Library/Application Support/relay/relay.db`
- Linux: `${XDG_DATA_HOME:-~/.local/share}/relay/relay.db`

Set `RELAY_DB_PATH` to use an explicit database file instead. Migrations run automatically when the HTTP/UI runtime starts. Connections enable foreign keys, WAL journal mode, and a 5-second SQLite busy timeout. Relay uses explicit SQL rather than an ORM.

For experiments and verification, create a disposable database instead of using your normal one. In PowerShell:

```powershell
$tempRelay = Join-Path ([System.IO.Path]::GetTempPath()) ("relay-" + [guid]::NewGuid())
New-Item -ItemType Directory -Path $tempRelay | Out-Null
$env:RELAY_DB_PATH = Join-Path $tempRelay "relay.db"
pnpm dev:ui
```

After stopping Relay, remove only that temporary directory when it is no longer needed:

```powershell
Remove-Item -LiteralPath $tempRelay -Recurse
```

Deleting any SQLite database permanently deletes its tasks. Never delete the default database unless you have deliberately backed it up and understand that consequence.

## Task workflow

Create tasks from the UI, select one to inspect its stored fields, and edit title, description, priority, workspace, and source context. Tasks created in the UI have `HUMAN` provenance. The UI provides four views: Inbox, Active, Backlog, and a bounded recent Completed list.

```text
INBOX -> ACTIVE -> IN_PROGRESS -> DONE
            |
            -> BACKLOG
```

Valid return paths are available through the action buttons: Active can return to Inbox, In Progress can return to Active, and Backlog can move to Inbox or Active. Moving a task to its current state is idempotent. The first move into In Progress records its start time; leaving and returning to In Progress preserves that original time.

Completed tasks can still be edited, but cannot be reopened in this MVP. Archiving is a two-step UI action. Archived tasks remain stored, including completion data when applicable, but are hidden from the normal views. There is currently no archive browser or restore action.

## Architecture boundaries

```text
src/
  domain/         # Task model, validation, and lifecycle rules
  application/    # Task use cases and repository port
  database/       # SQLite connection, migrations, and task repository
  interfaces/
    http/         # Loopback HTTP adapter and compiled UI serving
    mcp/          # Separate scaffold/health adapter; no task behavior yet
web/              # React UI that calls the HTTP API only
```

Adapters call application services. The React application calls the loopback HTTP API only; it does not import SQLite or domain code. The task domain does not depend on SQLite, HTTP, MCP, React, or Zod. Relay has no remote binding or authentication.

## Current limitations

The MVP deliberately does not include production MCP task tools, due dates or reminders, labels or projects, search, recurring tasks, archive restoration, collaboration or cloud sync, packaging/installers, or mobile support.

## Troubleshooting

- **Unsupported Node version:** use Node 24.x before running install or verification. Node 25+ is outside the supported range.
- **`better-sqlite3` install/build issue:** install Python and a C++ compiler toolchain if a native prebuilt binary is unavailable.
- **Port already in use:** stop the process using `127.0.0.1:43110` or set `RELAY_HTTP_PORT` to a free loopback port before running `pnpm dev:ui`.
- **Invalid or unwritable `RELAY_DB_PATH`:** use an absolute file path in a directory your account may create and write to. Check that no file blocks the parent directory.
- **Migration checksum mismatch:** an already-applied SQL migration was edited. Do not bypass the error; restore the original migration content and add a new migration for any schema change.
- **UI says the service is unavailable:** keep `pnpm dev:ui` running, confirm the HTTP service is reachable at `/api/health`, then use the UI retry button. Check the HTTP process output for the underlying error.
