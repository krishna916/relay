# Install Relay in Claude Desktop on Linux

Relay can be packaged as an unsigned Linux MCP Bundle (`.mcpb`) and installed as a
custom Claude Desktop extension. It runs Relay's canonical local stdio MCP server and
stores tasks in a local SQLite database.

> [!IMPORTANT]
> This integration is Linux-only and experimental. Ubuntu CI verifies bundle construction,
> native SQLite loading, migrations, MCP discovery, tool calls, and archive creation.
> Maintainer validation in a real Claude Desktop Linux client is still pending. See the
> [verification record](../../docs/claude-desktop-mcpb-verification.md).

## Prerequisites

Use a Linux machine with:

- Git;
- Node.js `24.x`;
- Corepack;
- the latest available Claude Desktop;
- permission to write to your normal user data directory.

Confirm Node before continuing:

```bash
node --version
```

Expected: a version beginning with `v24.`.

Do not build the bundle on Windows or macOS. The build refuses those platforms because
`better-sqlite3` is a native dependency.

## 1. Build the MCPB

From a terminal:

```bash
git clone https://github.com/krishna916/relay.git
cd relay
corepack enable
pnpm install --frozen-lockfile
pnpm build:mcpb
```

A successful build creates:

```text
artifacts/relay-<version>-linux-<arch>.mcpb
```

For example:

```text
artifacts/relay-0.1.0-linux-x64.mcpb
```

The build validates the manifest, stages production dependencies, loads native SQLite,
runs migrations, starts the staged MCP server, discovers Relay tools, calls
`relay_health`, and packs the final bundle.

Optionally record the generated checksum:

```bash
sha256sum artifacts/*.mcpb
```

Do not install an artifact produced for a different operating system or architecture.

## 2. Install the extension

In Claude Desktop:

1. Open **Settings**.
2. Select **Extensions**.
3. Open **Advanced settings**.
4. Find **Extension Developer**.
5. Select **Install Extension...**.
6. Choose the generated `.mcpb` under Relay's `artifacts/` directory.
7. Review the unsigned-extension warning and complete installation.

Anthropic documents the current custom-extension flow in
[Getting Started with Local MCP Servers on Claude Desktop](https://support.claude.com/en/articles/10949351-getting-started-with-local-mcp-servers-on-claude-desktop).

A managed organization may block custom extensions until an administrator permits them.

## 3. Confirm Relay is connected

After installation:

1. Open a new Claude Desktop conversation.
2. Select the **+** button beside the chat input.
3. Open **Connectors**.
4. Confirm that **Relay** appears and exposes tools.

The expected tools are:

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

If Relay is installed but unavailable, fully quit Claude Desktop and start it again.
Check Developer settings for the extension state and MCP logs.

## 4. Run a smoke test

The following steps create one real task in your local Relay database.

### Check health

Ask Claude:

```text
Use Relay's relay_health tool and report the returned name, status, and version.
```

Expected: Relay reports status `ok`.

### Capture a task

Ask Claude:

```text
Use Relay to capture a task titled "Verify Claude Desktop Relay installation".
Set createdByName to "Claude Desktop" and sessionId to
"claude-desktop-install-smoke-001". Do not change the task status after capture.
Return the created task ID.
```

Expected: the task is created in `INBOX`, and Claude returns its task ID.

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

Replace `<TASK_ID>` with the captured task ID. Expected: the status becomes `ACTIVE`.

## 5. Verify restart persistence

1. Fully quit Claude Desktop.
2. Start Claude Desktop again.
3. Open a new conversation.
4. Ask Claude to list the same exact session ID.

```text
Use Relay to list captures for the exact session ID
"claude-desktop-install-smoke-001". Confirm that the previously created task is
still present and ACTIVE.
```

Persistence succeeds when the same task ID and status remain available after restart.

When testing is complete, explicitly archive the test task:

```text
Using Relay, explicitly archive task <TASK_ID>.
```

Archiving retains task history while removing it from normal active views.

## Relay data location

Relay stores its database in the platform-default Linux user data directory. The precise
path and the `RELAY_DB_PATH` override are documented in
[Database and safe development data](../../README.md#database-and-safe-development-data).

The database is outside Claude Desktop's unpacked extension directory. Before making a
manual backup, fully quit Claude Desktop and copy the Relay data directory.

Never delete `relay.db` unless you intend to permanently delete the stored tasks. SQLite
may also create `relay.db-wal` and `relay.db-shm` while the database is open.

The MCPB manifest currently uses Relay's normal Linux data location. Relay supports an
explicit `RELAY_DB_PATH`, but the current extension does not expose a configuration field
for changing it.

## Updating Relay

Privately distributed MCPB files do not update automatically.

To install a newer bundle:

1. update the Relay checkout;
2. use a higher package version while keeping the MCPB name `relay`;
3. rerun `pnpm install --frozen-lockfile` and `pnpm build:mcpb` on Linux;
4. install the new `.mcpb` through Claude Desktop's custom-extension flow;
5. restart Claude Desktop when necessary;
6. repeat the health and exact-session checks.

## Disabling or removing Relay

Use Claude Desktop's extension controls to disable or remove Relay. Do not manually delete
files from Claude Desktop's extension storage.

Removing the extension does not delete the Relay database. Reinstalling a compatible Relay
bundle should reconnect to the same stored tasks.

To verify retention independently after removal, use Relay's source-checkout CLI:

```bash
pnpm build:node
node dist/cli/main.js task get <TASK_ID> --output json
```

Run the command from the Relay checkout. When using a non-default database path, set the
same absolute `RELAY_DB_PATH` before invoking the CLI.

## Troubleshooting

### The `.mcpb` file is not created

- Confirm the machine is Linux.
- Confirm `node --version` reports Node 24.
- Run commands from the Relay repository root.
- Re-run `pnpm install --frozen-lockfile`.
- Read the first failing build step instead of using a partial staging directory.

### Claude Desktop refuses to install the extension

- Update Claude Desktop.
- Confirm the file ends in `.mcpb` and is not a renamed ZIP.
- Rebuild the artifact instead of using a partially copied file.
- Confirm your account or organization permits custom extensions.

### Relay installs but tools are unavailable

- Fully quit and restart Claude Desktop.
- Confirm Relay is enabled under Connectors or Extensions.
- Inspect Developer settings and MCP logs.
- Remove an older conflicting custom extension named `relay`.

### Node or native SQLite failure

Relay requires Node `>=24 <25`. The bundled `better-sqlite3` binary must match Claude
Desktop's Linux runtime, architecture, Node ABI, and libc environment.

When logs report an unsupported Node version, missing native module, invalid ELF file, ABI
mismatch, or libc error, record the Linux distribution, architecture, Claude Desktop
version, Node version or ABI, and complete error. Open a Relay issue with that evidence.
Do not lower Relay's Node requirement or claim compatibility without review.

### Database permission or migration failure

- Confirm your account can write Relay's platform-default Linux data directory.
- Do not provide a directory where a database file path is expected.
- Do not edit an already-applied SQL migration.
- Preserve the database and logs before attempting recovery.

## Current support boundary

The bundle is unsigned, Linux-only, and intended for local evaluation. It is not published
through the Claude extension directory and is not claimed to support every Linux
distribution, architecture, libc variant, Claude Desktop release, or embedded Node ABI.

Record manual results in the
[Claude Desktop Linux MCPB verification document](../../docs/claude-desktop-mcpb-verification.md)
and report reproducible problems through the
[Relay issue tracker](https://github.com/krishna916/relay/issues).
