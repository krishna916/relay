# Relay Linux MCPB for Claude Desktop

This unsigned bundle is for local evaluation on one Linux machine only. It packages Relay's canonical MCP stdio server and does not establish broad Linux or Claude Desktop support.

## Build on Linux

Use Node 24 and pnpm 10.2.0. From the Relay checkout, run `pnpm install --frozen-lockfile` followed by `pnpm build:mcpb`. The output is `artifacts/relay-<version>-linux-<arch>.mcpb`.

These commands intentionally refuse to run on Windows and macOS before staging dependencies or writing an artifact. See [the verification record](../../docs/claude-desktop-mcpb-verification.md) for the current evidence status.

## Install and verify

In Claude Desktop, open Settings → Extensions → Advanced settings → Extension Developer → Install Extension, then select the generated `.mcpb`. Discover Relay through the chat `+` menu or Developer settings. Verify `relay_health`, capture a task with an exact session ID, retrieve that session, and perform only an explicitly directed mutation.

Fully quit and restart Claude Desktop, then repeat retrieval. For a local update, build a deliberately incremented test version and use the supported custom-extension update flow. Record the tested Linux distribution, architecture, Claude Desktop version, and any Node ABI information in the verification record.

## Data safety and troubleshooting

Relay durable data stays in its normal Linux location or the explicit `RELAY_DB_PATH`; it must never be placed in Claude's unpacked extension directory. Disabling or removing the extension does not delete the Relay database.

Inspect Claude extension logs for startup diagnostics. If Claude's hosted Node runtime does not meet Relay's `>=24 <25` requirement, or `better-sqlite3` cannot load for its Node ABI and Linux libc, stop and record the failure. Do not claim compatibility or lower the Node requirement without review.
