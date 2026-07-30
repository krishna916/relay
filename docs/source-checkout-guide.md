# Test Relay from a Source Checkout

This guide is for early testers who are comfortable cloning a repository and running Node.js commands. Relay is not packaged yet: there is no installer, automatic updater, background daemon, or marketplace integration.

The recommended source-checkout workflow creates two globally available commands that remain linked to your checkout:

- `relay` for the JSON CLI
- `relay-mcp` for MCP clients

You link the checkout once. After that, client configuration does not need to contain the checkout path.

Relay stores tasks in a local SQLite database and exposes the same data through its web UI, MCP server, and JSON CLI.

## What you will verify

By the end of this guide, you should be able to:

1. run Relay locally from source
2. open the web UI
3. connect Codex or Claude Code through `relay-mcp`
4. capture a task through the agent
5. retrieve tasks captured in the same exact session
6. see the captured task in the web UI

## Prerequisites

Install:

- Git
- Node.js `24.x`
- Corepack
- pnpm `10.2.0` through Corepack

Relay's supported Node version is defined in `.nvmrc`. Node 25 or newer is not supported.

If `better-sqlite3` cannot use a prebuilt binary on your platform, you may also need Python and a C++ build toolchain.

## 1. Clone, build, and link Relay

```bash
git clone https://github.com/krishna916/relay.git
cd relay
corepack enable
nvm use
pnpm install --frozen-lockfile
pnpm build
pnpm link
```

If you use `fnm`, `asdf`, Volta, or another version manager, select Node 24 before running `pnpm install`.

With pnpm 10, running `pnpm link` from a package checkout registers that package and its `bin` commands globally.

Confirm that both commands are available.

### macOS or Linux

```bash
command -v relay
command -v relay-mcp
```

### Windows PowerShell

```powershell
Get-Command relay
Get-Command relay-mcp
```

The global link points back to this checkout. It does not copy Relay into a separate installation directory.

If your shell cannot find the commands, inspect the pnpm global binary directory:

```bash
pnpm bin --global
```

Ensure that directory is on `PATH`, then restart the terminal and AI client.

## 2. Choose the database

### Normal testing

For the simplest setup, do not set `RELAY_DB_PATH`. Relay uses its platform-specific default database:

- Windows: `%APPDATA%\relay\relay.db`
- macOS: `~/Library/Application Support/relay/relay.db`
- Linux: `${XDG_DATA_HOME:-~/.local/share}/relay/relay.db`

The UI, `relay`, and `relay-mcp` will all resolve the same default location.

### Isolated disposable testing

Use an explicit `RELAY_DB_PATH` only when you want test data separated from normal Relay data.

From the Relay checkout:

#### macOS or Linux

```bash
mkdir -p .relay-validation
export RELAY_DB_PATH="$(pwd)/.relay-validation/relay.db"
```

#### Windows PowerShell

```powershell
New-Item -ItemType Directory -Force -Path .relay-validation | Out-Null
$env:RELAY_DB_PATH = (Resolve-Path .relay-validation).Path + "\relay.db"
```

An isolated MCP configuration needs this resolved absolute database path because the MCP client may start Relay from another working directory. This is optional and is the only normal reason the setup requires an absolute path.

Do not delete a database that contains tasks you want to keep. Removing an MCP configuration does not remove SQLite data.

## 3. Start the web UI

From the Relay checkout:

```bash
pnpm dev:ui
```

Open:

```text
http://127.0.0.1:5173
```

The UI development server proxies API calls to Relay's loopback-only HTTP service at `http://127.0.0.1:43110`.

Keep this terminal running while testing the UI. Relay has no background daemon.

When using an isolated database, start the UI from a shell where the same `RELAY_DB_PATH` is set.

## 4. Connect an AI client

Choose one client. MCP is the preferred integration. The JSON CLI is a deterministic fallback.

### Codex

For normal use with the default database:

```toml
[mcp_servers.relay]
command = "relay-mcp"
```

For an isolated database:

```toml
[mcp_servers.relay]
command = "relay-mcp"

[mcp_servers.relay.env]
RELAY_DB_PATH = "/absolute/path/to/relay/.relay-validation/relay.db"
```

Install the canonical companion skills into the repository where you will use Codex:

```text
.agents/skills/relay-capture/
.agents/skills/relay-session-review/
```

Copy these complete directories unchanged from the Relay checkout:

```text
skills/relay-capture/
skills/relay-session-review/
```

Start a new Codex session, then use `/mcp` or `codex mcp list` to confirm Relay is configured.

The checked-in [Codex template](../integrations/codex/config.toml.example) shows the absolute-entry fallback for users who do not want a global link.

### Claude Code

For normal use with the default database:

```bash
claude mcp add --transport stdio --scope project relay -- relay-mcp
```

For an isolated database:

```bash
claude mcp add --transport stdio --scope project \
  --env RELAY_DB_PATH=/absolute/path/to/relay/.relay-validation/relay.db \
  relay -- relay-mcp
```

Install the complete canonical skill directories unchanged at:

```text
.claude/skills/relay-capture/
.claude/skills/relay-session-review/
```

Then restart Claude Code and validate with:

```bash
claude mcp list
claude mcp get relay
```

You can also use `/mcp` inside Claude Code to inspect or authorize the server.

The checked-in [Claude Code template](../integrations/claude-code/.mcp.json.example) remains available as the absolute-entry fallback.

### Another MCP-capable client

Configure a local stdio server with:

```text
command: relay-mcp
arguments: none
environment: omit RELAY_DB_PATH for the default database
```

Add an absolute `RELAY_DB_PATH` only for isolated testing.

The [generic MCP template](../integrations/generic-mcp/server-config.json.example) documents the no-global-link fallback.

## 5. Run the five-minute smoke test

Relay exposes the health tool and task tools including:

- `relay_health`
- `task_capture`
- `task_list`
- `task_get`
- `task_find_similar`
- `session_captures_list`

Use a unique exact session ID and keep it unchanged throughout the test. For example:

```text
relay-test-20260730-yourname-001
```

Ask the agent:

```text
Use Relay MCP for this test.

1. Call relay_health.
2. Capture a task titled "Verify Relay source-checkout integration".
3. Use agent name "manual-tester", workspace "relay-test", and exact session ID "relay-test-20260730-yourname-001".
4. Add source context "source-checkout smoke test".
5. List INBOX tasks in workspace "relay-test".
6. Get the captured task by ID.
7. Retrieve captures for the exact same session ID.
8. Report the tool results without triaging, completing, editing, or archiving the task.
```

Expected results:

- `relay_health` succeeds.
- The captured task has `AGENT` provenance.
- The captured task starts in `INBOX`.
- Agent, workspace, session ID, and source context are preserved.
- The task appears in `task_list` and `task_get`.
- `session_captures_list` returns the task for the exact session ID.
- Possible duplicate matches may appear as advisory warnings.

Return to `http://127.0.0.1:5173`. The same task should appear in the Inbox when the UI and MCP process resolve the same database.

## 6. Test the JSON CLI fallback

With the global link, the CLI works from any directory:

```bash
relay task list --status INBOX --workspace relay-test --output json
```

For an isolated database on macOS or Linux:

```bash
RELAY_DB_PATH=/absolute/path/to/relay/.relay-validation/relay.db \
relay task list --status INBOX --workspace relay-test --output json
```

For an isolated database in Windows PowerShell:

```powershell
$env:RELAY_DB_PATH = 'C:\absolute\path\to\relay\.relay-validation\relay.db'
relay task list --status INBOX --workspace relay-test --output json
```

The authoritative CLI output is one JSON document on stdout. See the [CLI contract reference](cli-reference.md) for all commands and stable exit codes.

## Updating the source checkout

Stop running Relay processes that use the checkout, then run:

```bash
git pull --ff-only
corepack enable
nvm use
pnpm install --frozen-lockfile
pnpm build
```

The global link continues pointing to the same checkout, so `pnpm link` normally does not need to be repeated.

Restart the UI and AI client after rebuilding.

## Disable or remove Relay

### Remove client configuration

For Codex, remove the `[mcp_servers.relay]` configuration and delete only the copied Relay skill directories from `.agents/skills/`.

For Claude Code:

```bash
claude mcp remove relay
```

Also delete only the copied Relay skill directories from `.claude/skills/`.

These actions disable agent integration but leave the SQLite database and global source link untouched.

### Remove the global source link

Run:

```bash
pnpm uninstall --global relay
```

Confirm that the commands are no longer resolvable with `command -v` on macOS/Linux or `Get-Command` in PowerShell.

Unlinking does not delete the checkout or SQLite database.

Delete `.relay-validation/` only when you are certain it contains disposable test data.

## Absolute-path fallback

Users who do not want a global link may still configure clients with:

```text
node ABSOLUTE_CHECKOUT/dist/mcp/main.js
```

and invoke the CLI with:

```text
node ABSOLUTE_CHECKOUT/dist/cli/main.js
```

This fallback is reliable because MCP clients do not guarantee that their working directory is the Relay checkout. A plain relative path such as `./dist/mcp/main.js` is therefore not recommended.

## Troubleshooting

- **`relay` or `relay-mcp` is not found:** run `pnpm link` from the Relay checkout, inspect `pnpm bin --global`, ensure that directory is on `PATH`, and restart the terminal or client.
- **MCP server is missing:** rebuild with `pnpm build`, restart the client, and inspect its MCP server list.
- **Agent and UI show different tasks:** either remove `RELAY_DB_PATH` from both, or ensure both use the exact same isolated path.
- **Database cannot be opened:** use an absolute path in a directory your operating-system account can create and write to.
- **Unsupported Node version:** select Node 24.x. Node 25 or newer is outside the supported range.
- **`better-sqlite3` installation fails:** install Python and a C++ compiler toolchain if no native prebuilt binary is available.
- **Port `43110` is busy:** stop the existing process or set `RELAY_HTTP_PORT` to a free loopback port before running `pnpm dev:ui`.
- **Migration checksum mismatch:** restore the original applied migration and create a new migration for schema changes.

More detail is available in [agent-integration troubleshooting](troubleshooting-agent-integration.md), [agent integration](agent-integration.md), [MCP tools](mcp-tools.md), and [session semantics](session-semantics.md).

## Current limitations

This workflow does not provide:

- an installer or automatic updater
- automatic client configuration
- a background service
- remote MCP or cloud sync
- authentication or multi-user access
- due dates, reminders, recurrence, projects, or collaboration

The checked-in Codex and Claude Code assets follow their documented formats, but earlier live smoke validation was incomplete. Tester results remain valuable compatibility evidence.

## Send feedback

Please include:

```text
Operating system:
Node version:
pnpm version:
AI client and version:
Integration used: Codex / Claude Code / generic MCP / CLI
Relay commit:
Database path type: platform default / isolated test path
Session ID used:
relay_health result:
Tool discovery result:
Task capture result:
Exact-session lookup result:
UI visibility result:
Errors or confusing steps:
Anything you expected but could not do:
```

Do not include secrets, full prompts, private source code, or unrelated task contents.
