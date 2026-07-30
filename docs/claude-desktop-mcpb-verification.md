# Claude Desktop Linux MCPB Verification

## Scope and support statement

This work packages Relay's canonical MCP stdio server for later Linux evaluation. It does not claim Linux MCPB compatibility.

## Official-source verification

On 2026-07-30, the MCPB repository, manifest specification, CLI reference, and Claude Desktop local-server guide were rechecked. The source manifest targets MCPB manifest version 0.3 and Node stdio entry-point configuration.

## Build environment

Implementation was performed on Windows. Ubuntu CI run [30570500715](https://github.com/krishna916/relay/actions/runs/30570500715) executed the Linux packaging and runtime checks on `ubuntu-latest` with Node.js 24.

## Bundle contents

The staged bundle is designed to include the canonical `dist/mcp/main.js`, package metadata, migrations, and production dependencies only. Durable SQLite data remains outside the extension directory through Relay's existing data-path resolution and `RELAY_DB_PATH` override.

## Windows implementation verification

Platform-independent model, staging, source-asset, and command-orchestration tests run on Windows. The Linux-only commands reject `win32` before staging production dependencies, generating an artifact, or altering repository output.

## Linux native build verification

The Ubuntu CI job passed the complete ordered sequence: verification gate, Linux MCPB staging, the opt-in staged integration suite, MCPB validation, staged runtime verification, and MCPB pack/info inspection. This verifies the staged native `better-sqlite3` load, disposable migrations/database path, MCP tool discovery, protocol-clean success stderr, and raw startup-failure stdout/stderr separation in the CI runtime. It does not establish maintainer Claude Desktop compatibility.

## Claude Desktop Linux verification

Not executed; pending a supported Linux environment and an installed Claude Desktop client.

## Pending evidence

Claude Desktop installation, tool discovery through the desktop client, capture and session retrieval, explicit mutation, restart, update, disable, and removal data-retention checks remain pending.

## Failures and limitations

Windows must not be used as evidence for Linux native `better-sqlite3`, Node ABI, staged MCP runtime, or Claude Desktop support.

## Completion decision

**UNVERIFIED — Claude Desktop Linux validation pending.**
