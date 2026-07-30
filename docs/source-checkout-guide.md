# Test Relay from a Source Checkout

This guide is for early testers who are comfortable cloning a repository and running Node.js commands. Relay is not packaged yet: there is no installer, globally installed `relay` command, background daemon, or marketplace integration. You will run Relay directly from a local source checkout.

Relay stores tasks in a local SQLite database and exposes the same data through its web UI, MCP server, and JSON CLI.

## What you will verify

By the end of this guide, you should be able to:

1. run Relay locally from source
2. open the web UI
3. connect Codex or Claude Code to Relay over local MCP stdio
4. capture a task through the agent
5. retrieve tasks captured in the same exact session
6. see the captured task in the web UI

For the first test, use an isolated database rather than your normal Relay database.

## Prerequisites

Install:

- Git
- Node.js `24.x`
- Corepack
- pnpm `10.2.0` through Corepack

Relay's supported Node version is defined in `.nvmrc`. Node 25 or newer is not supported.

If `better-sqlite3` cannot use a prebuilt binary on your platform, you may also need Python and a C++ build toolchain.

## 1. Clone and build Relay

```bash
git clone https://github.com/krishna916/relay.git
cd relay
corepack enable
nvm use
pnpm install --frozen-lockfile
pnpm build:node
```

If you use `fnm`, `asdf`, Volta, or another version manager, select Node 24 before running `pnpm install`.

`pnpm build:node` creates the built MCP and CLI entry points used by agent integrations:

```text
dist/mcp/main.js
dist/cli/main.js
```

Use the absolute path to your Relay checkout in every client configuration. Do not rely on the client's working directory.

## 2. Create an isolated test database

Create a directory inside the checkout for disposable validation data:

### macOS or Linux

```bash
mkdir -p .relay-validation
export RELAY_DB_PATH="$(pwd)/.relay-validation/relay.db"
```

### Windows PowerShell

```powershell
New-Item -ItemType Directory -Force -Path .relay-validation | Out-Null
$env:RELAY_DB_PATH = (Resolve-Path .relay-validation).Path + "\relay.db"
```

Use the resulting absolute database path in both the UI process and your MCP client configuration. This ensures the agent and UI read the same tasks.

Do not delete a database that contains tasks you want to keep. Removing an MCP configuration does not remove the SQLite database.

## 3. Start the web UI

From the Relay checkout, with `RELAY_DB_PATH` still set:

```bash
pnpm dev:ui
```

Open:

```text
http://127.0.0.1:5173
```

The UI development server proxies API calls to Relay's loopback-only HTTP service at `http://127.0.0.1:43110`.

Keep this terminal running while testing the UI. Relay has no background daemon.

## 4. Connect an AI client

Choose one client. MCP is the preferred integration. The JSON CLI is available as a deterministic fallback.

Replace every placeholder below with the absolute path to your Relay checkout. Use forward slashes in JSON and TOML paths, including on Windows where practical.

### Codex

Relay includes a template at:

```text
integrations/codex/config.toml.example
```

Add the following to a trusted project or user-scoped Codex configuration:

```toml
[mcp_servers.relay]
command = "node"
args = ["ABSOLUTE_CHECKOUT/dist/mcp/main.js"]

[mcp_servers.relay.env]
RELAY_DB_PATH = "ABSOLUTE_CHECKOUT/.relay-validation/relay.db"
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

Start a new Codex session, then use `/mcp` or `codex mcp list` to confirm that Relay is configured.

See [Codex integration details](../integrations/codex/README.md).

### Claude Code

From the project where you want to use Relay, add the MCP server using an absolute checkout path:

```bash
claude mcp add --transport stdio --scope project \
  --env RELAY_DB_PATH=ABSOLUTE_CHECKOUT/.relay-validation/relay.db \
  relay -- node ABSOLUTE_CHECKOUT/dist/mcp/main.js
```

Alternatively, adapt the template at:

```text
integrations/claude-code/.mcp.json.example
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

See [Claude Code integration details](../integrations/claude-code/README.md).

### Another MCP-capable client

Use the generic template at:

```text
integrations/generic-mcp/server-config.json.example
```

Configure a local stdio server with:

```text
command: node
argument: ABSOLUTE_CHECKOUT/dist/mcp/main.js
environment: RELAY_DB_PATH=ABSOLUTE_CHECKOUT/.relay-validation/relay.db
```

See [generic MCP integration details](../integrations/generic-mcp/README.md).

## 5. Run the five-minute smoke test

The initial MCP surface contains the health tool and five safe task tools:

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

Ask the agent to perform these steps through Relay MCP:

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
- The agent, workspace, session ID, and concise source context are preserved.
- The task appears in `task_list` and `task_get`.
- `session_captures_list` returns the task for the exact session ID.
- Possible duplicate matches may appear as advisory warnings; they do not prevent capture.

Now return to `http://127.0.0.1:5173`. The same task should appear in the Inbox because the UI and MCP server use the same `RELAY_DB_PATH`.

Do not ask the agent to complete, archive, edit, start, or triage tasks autonomously. Those lifecycle actions require explicit user direction.

## 6. Test the JSON CLI fallback

The CLI is useful for one-shot verification or clients without MCP support. It calls Relay's application services directly; it does not start HTTP or MCP.

From any working directory, set the same database path and invoke the built entry using an absolute checkout path.

### macOS or Linux

```bash
RELAY_DB_PATH=/absolute/path/to/relay/.relay-validation/relay.db \
node /absolute/path/to/relay/dist/cli/main.js task list --status INBOX --workspace relay-test --output json
```

### Windows PowerShell

```powershell
$env:RELAY_DB_PATH = 'C:\absolute\path\to\relay\.relay-validation\relay.db'
node C:\absolute\path\to\relay\dist\cli\main.js task list --status INBOX --workspace relay-test --output json
```

The authoritative CLI output is one JSON document on stdout. See the [CLI contract reference](cli-reference.md) for capture, lookup, session, lifecycle commands, and stable exit codes.

## Updating the source checkout

Stop running Relay and agent sessions that are using the checkout, then run:

```bash
git pull --ff-only
corepack enable
nvm use
pnpm install --frozen-lockfile
pnpm build:node
```

Restart the UI and your AI client after rebuilding. Existing client configuration can remain unchanged as long as the absolute checkout path and database path did not move.

SQL migrations run automatically when Relay opens the database. Do not edit an already-applied migration to work around a checksum error.

## Disable or remove Relay from a client

### Codex

Remove the `[mcp_servers.relay]` configuration and delete only the copied Relay skill directories from `.agents/skills/`.

### Claude Code

Run:

```bash
claude mcp remove relay
```

Or remove the Relay entry from `.mcp.json`. Delete only the copied Relay skill directories from `.claude/skills/`.

### Other clients

Remove the Relay MCP server entry and any copied canonical skill directories.

These actions disable the integration but intentionally leave the SQLite database untouched.

Delete `.relay-validation/` only when you are certain it contains disposable test data. Deleting a SQLite database permanently deletes its tasks.

## Troubleshooting

- **Unsupported Node version:** select Node 24.x. Node 25 or newer is outside the supported range.
- **MCP server is missing after configuration:** use an absolute checkout path, run `pnpm build:node` again, restart the client, and inspect its MCP server list.
- **Agent and UI show different tasks:** ensure both processes use the exact same absolute `RELAY_DB_PATH`.
- **Database cannot be opened:** use an absolute path in a directory your operating-system account can create and write to.
- **`better-sqlite3` installation fails:** install Python and a C++ compiler toolchain if no native prebuilt binary is available.
- **Port `43110` is busy:** stop the existing process or set `RELAY_HTTP_PORT` to a free loopback port before running `pnpm dev:ui`.
- **Migration checksum mismatch:** restore the original applied migration and create a new migration for schema changes.
- **UI reports that the service is unavailable:** keep `pnpm dev:ui` running and verify the HTTP health endpoint at `http://127.0.0.1:43110/api/health`.

More detail is available in [agent-integration troubleshooting](troubleshooting-agent-integration.md), [agent integration](agent-integration.md), [MCP tools](mcp-tools.md), and [session semantics](session-semantics.md).

## Current limitations

This source-checkout workflow does not provide:

- a packaged `relay` executable
- an installer or automatic updater
- automatic client configuration
- a background service
- remote MCP or cloud sync
- authentication or multi-user access
- due dates, reminders, recurrence, projects, or collaboration

The checked-in Codex and Claude Code configuration assets follow their documented integration formats, but live smoke validation was not completed in the maintainer's earlier environment. Your test results are therefore valuable compatibility evidence rather than a repetition of an already completed client certification.

## Send feedback

Please include:

```text
Operating system:
Node version:
pnpm version:
AI client and version:
Integration used: Codex / Claude Code / generic MCP / CLI
Relay commit:
Database path type: isolated test path / normal path
Session ID used:
relay_health result:
Tool discovery result:
Task capture result:
Exact-session lookup result:
UI visibility result:
Errors or confusing steps:
Anything you expected but could not do:
```

Do not include secrets, full prompts, private source code, or the contents of unrelated tasks in the report.
