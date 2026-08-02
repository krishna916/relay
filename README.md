# Relay

Safe installed setup is documented in [setup and configuration](docs/setup-and-configuration.md). Use an explicit absolute `--config-file` and preview before `--apply`; generic MCP is snippet-only.

For Linux-only Claude Desktop MCPB evaluation, see [the MCPB guide](integrations/claude-desktop/README.md) and [verification record](docs/claude-desktop-mcpb-verification.md).

**Testing Relay for the first time?** Follow the [source-checkout installation and usage guide](docs/source-checkout-guide.md) to clone, run, connect an AI client, and complete a safe smoke test.

Agent integrations: see [setup](docs/agent-integration.md) and [troubleshooting](docs/troubleshooting-agent-integration.md).

The approved agent-integration contract is documented in the [decision record](docs/decisions/0002-agent-integration-contracts.md), [MCP tool reference](docs/mcp-tools.md), [CLI reference](docs/cli-reference.md), and [session semantics](docs/session-semantics.md). The production MCP task tools and source-checkout CLI are shipped.

Distribution planning is documented in the [Distribution decision](docs/decisions/0003-distribution-filesystem-and-lifecycle.md) and [Distribution contracts](docs/distribution/). Build and verify the local publishable tarball with the [npm package guide](docs/distribution/npm-package.md); registry publication remains a separate maintainer action.

Relay is a local task sidecar for human–AI workflows. The current MVP is usable through its local web UI and through five safe local stdio MCP task tools.

## Agent skills

The canonical [Relay Capture](skills/relay-capture/SKILL.md) and [Relay Session Review](skills/relay-session-review/SKILL.md) files guide agent behaviour; they do not implement persistence or protocol handlers. MCP is preferred and the CLI JSON output is the fallback; one adapter is retained through one workflow unless unavailable. The caller supplies the agent name and exact active session ID, Relay owns `createdByType` and autonomous `INBOX` status, and the exact-session lookup always occurs before final completion, including when its authoritative result is empty. See [agent skill guidance](docs/agent-skills.md) and the authoritative [MCP](docs/mcp-tools.md), [CLI](docs/cli-reference.md), and [session](docs/session-semantics.md) contracts.

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

To use the source-checkout CLI from any working directory, run `pnpm build:node` from the repository checkout root first (or use `pnpm --dir /absolute/path/to/relay build:node` from another working directory):

```bash
pnpm build:node
RELAY_DB_PATH=/tmp/relay.db node /absolute/path/to/relay/dist/cli/main.js task list --output json
```

The CLI calls `TaskApplication` directly; it does not start HTTP or MCP processes. Its JSON envelope is authoritative: stdout contains one JSON document and newline, success writes no stderr, and failures also print one human-readable diagnostic to stderr. See the [CLI reference](docs/cli-reference.md) for all commands and stable exit codes.

It exposes five task tools—`task_capture`, `task_list`, `task_get`, `task_find_similar`, and `session_captures_list`—plus the separate `relay_health` tool. MCP task results use structured schema-versioned payloads; capture records AGENT provenance and reports possible duplicates as advisory warnings.

## Database and safe development data

Relay uses a local SQLite database containing task data. The default database file is:

- Windows: `%LOCALAPPDATA%\Relay\relay.db`
- macOS: `~/Library/Application Support/Relay/relay.db`
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
    mcp/          # MCP health and production task-tool adapter
    cli/          # Source-checkout JSON CLI adapter
web/              # React UI that calls the HTTP API only
```

Adapters call application services. The React application calls the loopback HTTP API only; it does not import SQLite or domain code. The task domain does not depend on SQLite, HTTP, MCP, React, or Zod. Relay has no remote binding or authentication.

## Current limitations

The MVP includes production MCP task tools, but deliberately does not include due dates or reminders, labels or projects, search, recurring tasks, archive restoration, collaboration or cloud sync, packaging/installers, or mobile support.

## Troubleshooting

- **Unsupported Node version:** use Node 24.x before running install or verification. Node 25+ is outside the supported range.
- **`better-sqlite3` install/build issue:** install Python and a C++ compiler toolchain if a native prebuilt binary is unavailable.
- **Port already in use:** stop the process using `127.0.0.1:43110` or set `RELAY_HTTP_PORT` to a free loopback port before running `pnpm dev:ui`.
- **Invalid or unwritable `RELAY_DB_PATH`:** use an absolute file path in a directory your account may create and write to. Check that no file blocks the parent directory.
- **Migration checksum mismatch:** an already-applied SQL migration was edited. Do not bypass the error; restore the original migration content and add a new migration for any schema change.
- **UI says the service is unavailable:** keep `pnpm dev:ui` running, confirm the HTTP service is reachable at `/api/health`, then use the UI retry button. Check the HTTP process output for the underlying error.
