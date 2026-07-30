# Claude Desktop Linux MCPB Verification

## Scope and support statement

This work packages Relay's canonical MCP stdio server for later Linux evaluation. It does not claim Linux MCPB compatibility.

## Official-source verification

On 2026-07-30, the MCPB repository, manifest specification, CLI reference, and Claude Desktop local-server guide were rechecked. The source manifest targets MCPB manifest version 0.3 and Node stdio entry-point configuration.

## Build environment

Windows implementation environment. Linux runtime testing was unavailable.

## Bundle contents

The staged bundle is designed to include the canonical `dist/mcp/main.js`, package metadata, migrations, and production dependencies only. Durable SQLite data remains outside the extension directory through Relay's existing data-path resolution and `RELAY_DB_PATH` override.

## Automated verification

Platform-independent tests are pending implementation and execution in this checkout.

## Claude Desktop installation

Not executed; pending a supported Linux environment.

## Tool and workflow verification

Not executed from a Linux staged package; pending a supported Linux environment.

## Restart and update verification

Not executed; pending a supported Linux environment.

## Disable and removal verification

Not executed; pending a supported Linux environment.

## Failures and limitations

Windows must not be used as evidence for Linux native `better-sqlite3`, Node ABI, staged MCP runtime, or Claude Desktop support.

## Completion decision

**UNVERIFIED — Linux build and Claude Desktop validation pending.**
