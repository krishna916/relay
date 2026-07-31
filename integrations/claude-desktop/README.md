# Install Relay in Claude Desktop on Linux

Relay can be packaged as an unsigned Linux MCP Bundle (`.mcpb`) and installed as a custom Claude Desktop extension. The bundle runs Relay's canonical local stdio MCP server and stores tasks in a local SQLite database.

> [!IMPORTANT]
> This integration is currently **Linux-only and experimental**. Ubuntu CI verifies bundle construction, native `better-sqlite3` loading, migrations, MCP discovery, tool calls, and archive creation. Installation in a maintainer's real Claude Desktop Linux client is still pending; see the [verification record](../../docs/claude-desktop-mcpb-verification.md).

## What this guide covers

This guide shows how to:

1. build the Linux MCPB from a Relay source checkout;
2. install it as a custom Claude Desktop extension;
3. confirm that Claude can discover and call Relay tools;
4. verify task persistence across a Claude Desktop restart;
5. update, disable, or remove the extension without deleting Relay data.

Relay does not currently publish a prebuilt MCPB release artifact, so the bundle must be built locally on Linux.

## Prerequisites

Use a supported Linux machine with:

- the latest available Claude Desktop;
- Git;
- Node.js `24.x`;
- Corepack;
- enough disk space for the staged dependencies and approximately 35 MB bundle;
- permission to write to your normal user data directory.

Relay requires Node `>=24 <25`. Do not build the Linux bundle on Windows or macOS: the build intentionally refuses those platforms because `better-sqlite3` is a native dependency.

Confirm the runtime before continuing:

```bash
node --version
```

Expected: a version beginning with `v24.`.

## 1. Build the MCPB

From a terminal:

```bash
git clone https://github.com/krishna916/relay.git
cd relay
corepack enable
pnpm install --frozen-lockfile
pnpm build:mcpb
```

The build performs these checks in order:

- builds Relay's canonical MCP server;
- stages the reviewed MCPB assets and production dependencies;
- validates the MCPB manifest;
- loads native `better-sqlite3` and opens a disposable database;
- runs migrations;
- starts the staged MCP server from an unrelated working directory;
- discovers the canonical Relay tools and calls `relay_health`;
- verifies startup failures remain on stderr instead of corrupting MCP stdout;
- packs and inspects the final bundle.

A successful build creates:

```text
artifacts/relay-<version>-linux-<arch>.mcpb
```

For example:

```text
artifacts/relay-0.1.0-linux-x64.mcpb
```

Inspect the generated file and optionally record its checksum:

```bash
ls -lh artifacts/*.mcpb
sha256sum artifacts/*.mcpb
```

Do not install an artifact produced on a different operating system or architecture.

## 2. Install the custom extension

In Claude Desktop:

1. Open **Settings**.
2. Select **Extensions**.
3. Open **Advanced settings**.
4. Find **Extension Developer**.
5. Click **Install Extension...**.
6. Select the generated file under Relay's `artifacts/` directory.
7. Review the extension name, version, requested access, and unsigned-extension warning.
8. Complete the installation.

Anthropic's current custom-extension flow is documented in [Getting Started with Local MCP Servers on Claude Desktop](https://support.claude.com/en/articles/10949351-getting-started-with-local-mcp-servers-on-claude-desktop).

If your organization manages desktop extensions through an allowlist, a local custom extension may be blocked until an administrator permits it.

## 3. Confirm Relay is connected

After installation:

1. Open a new Claude Desktop conversation.
2. Click the **+** button beside the chat input.
3. Open **Connectors**.
4. Confirm that **Relay** appears and exposes its tools.

You can also open Claude Desktop's **Developer settings** to inspect the extension connection state and MCP logs.

If Relay is installed but unavailable, fully quit Claude Desktop and start it again before troubleshooting further.

The expected Relay tools are:

```text
relay_health
task_capture
task_list
task_get
task_find_similar
session_captures_list
task_edit
task_triage
task_start
task_complete
task_archive
```

## 4. Run a safe smoke test

The following test creates a real task in your local Relay database. Use the distinctive title and session ID so the task is easy to find and archive afterward.

### Health check

Ask Claude:

```text
Use Relay's relay_health tool and report the returned name, status, and version.
```

Expected: Relay reports status `ok`.

### Capture one task

Ask Claude:

```text
Use Relay to capture a task titled "Verify Claude Desktop Relay installation".
Set createdByName to "Claude Desktop" and sessionId to
"claude-desktop-install-smoke-001". Do not change the task status after capture.
Return the created task ID.
```

Expected:

- the task is created with agent provenance;
- its initial status is `INBOX`;
- Claude returns the task ID;
- no duplicate warning is treated as a hard failure.

### Retrieve the exact session

Ask Claude:

```text
Use Relay to list captures for the exact session ID
"claude-desktop-install-smoke-001". Return each task's ID, title, and status.
```

Expected: the captured task appears in the exact-session result.

### Perform one explicit mutation

Ask Claude:

```text
Using Relay, explicitly triage task <TASK_ID> to ACTIVE. Then retrieve the task
and report its final status.
```

Replace `<TASK_ID>` with the ID returned by the capture step.

Expected: the task status becomes `ACTIVE`.

## 5. Verify persistence after restart

1. Fully quit Claude Desktop.
2. Start Claude Desktop again.
3. Open a new conversation.
4. Ask Claude to list captures for the same exact session ID:

```text
Use Relay to list captures for the exact session ID
"claude-desktop-install-smoke-001". Confirm that the previously created task is
still present and ACTIVE.
```

Persistence succeeds when the same task ID and status remain available after restart.

When the test is complete, you may explicitly ask Claude to archive the test task:

```text
Using Relay, explicitly archive task <TASK_ID>.
```

Archiving does not delete the task; it removes it from normal active views while retaining its history.

## Relay data location

By default, Relay stores its Linux database at:

```text
${XDG_DATA_HOME:-~/.local/share}/relay/relay.db
```

The database is intentionally outside Claude Desktop's unpacked extension directory. Disabling, updating, or removing the extension should therefore leave task data intact.

Before making a manual backup, fully quit Claude Desktop so Relay has closed its SQLite connection. Then copy the `relay` data directory to a safe location.

Never delete `relay.db` unless you deliberately intend to permanently delete the stored tasks. SQLite may also create `relay.db-wal` and `relay.db-shm` while the database is open.

The Relay server still supports an explicit `RELAY_DB_PATH` override, but the current MCPB manifest does not expose a Claude Desktop configuration field for changing it. The standard MCPB installation therefore uses Relay's normal Linux data location.

## Updating the extension

Privately distributed MCPB files do not update automatically.

To install a newer Relay bundle:

1. update the Relay checkout to a newer version;
2. ensure the package version is higher while the MCPB name remains `relay`;
3. rerun `pnpm install --frozen-lockfile` and `pnpm build:mcpb` on Linux;
4. install the newly generated `.mcpb` through Claude Desktop's custom-extension flow;
5. restart Claude Desktop if the new version is not immediately active;
6. repeat `relay_health` and the exact-session retrieval check.

Do not overwrite the version field only to force an update without understanding the source changes being packaged.

## Disabling or removing Relay

Use Claude Desktop's extension controls to disable or remove Relay. Do not manually delete files from Claude Desktop's extension storage.

Removing the extension does not delete the Relay database. It remains in the normal Linux data directory, and reinstalling a compatible Relay bundle should reconnect to the same stored tasks.

To verify retention independently after removal, build Relay's CLI from the source checkout and query the recorded task using the same database:

```bash
pnpm build:node
node dist/cli/main.js task get <TASK_ID> --output json
```

Run the command from the Relay checkout. If your data uses a non-default path outside the MCPB flow, set the same absolute `RELAY_DB_PATH` before invoking the CLI.

## Troubleshooting

### The `.mcpb` file is not created

- Confirm the machine is Linux.
- Confirm `node --version` reports Node 24.
- Run the command from the Relay repository root.
- Re-run `pnpm install --frozen-lockfile` before `pnpm build:mcpb`.
- Read the first failing build step instead of using a partially staged directory.

### Claude Desktop refuses to install the extension

- Update Claude Desktop to the latest available version.
- Confirm the selected file ends in `.mcpb` and is not a renamed ZIP.
- Rebuild the artifact instead of using a damaged or partially copied file.
- Confirm your account or organization permits custom desktop extensions.
- Check available disk space and user-directory permissions.

### Relay installs but its tools are unavailable

- Fully quit and restart Claude Desktop.
- Check **+ → Connectors** for Relay.
- Check Developer settings for connection state and MCP logs.
- Confirm the extension is enabled.
- Remove an older conflicting custom extension with the same `relay` manifest name before reinstalling the intended version.

### Node runtime or native SQLite failure

Relay requires Node `>=24 <25`, and `better-sqlite3` must match Claude Desktop's Linux runtime, architecture, ABI, and libc environment.

If logs report an unsupported Node version, missing native module, invalid ELF file, ABI mismatch, or libc error:

1. stop the validation attempt;
2. record the Linux distribution, architecture, Claude Desktop version, Node version/ABI shown in logs, and the complete error;
3. open a Relay issue with that evidence;
4. do not lower Relay's Node requirement or claim compatibility without a reviewed decision.

Ubuntu CI success is useful evidence for its runner environment, but it does not prove compatibility with every Linux distribution or Claude Desktop build.

### Database permission or migration error

- Confirm your account can create and write `${XDG_DATA_HOME:-~/.local/share}/relay/`.
- Do not point Relay at a directory when a database file path is expected.
- Do not edit an already-applied SQL migration.
- Preserve the original database and logs before attempting recovery.

## Current support boundary

The bundle is unsigned, Linux-only, and intended for local evaluation. It is not yet published through the Claude extension directory and is not claimed to support every Linux distribution, architecture, libc variant, Claude Desktop release, or embedded Node ABI.

Record successful or failed manual testing in the [Claude Desktop Linux MCPB verification document](../../docs/claude-desktop-mcpb-verification.md) and report reproducible problems through the [Relay issue tracker](https://github.com/krishna916/relay/issues).
