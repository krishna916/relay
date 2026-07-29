# Agent Integration

## Supported source-checkout model

Relay integrations run the built entries from an absolute source checkout: `node __RELAY_CHECKOUT__/dist/mcp/main.js` or `node __RELAY_CHECKOUT__/dist/cli/main.js`. `relay mcp` is a future packaged command owned by Epic #18 and is not available.

For source development only, run `pnpm dev:mcp` from the checkout; vendor configuration should use the built Node entry so it is independent of the current working directory.

## Compatibility verification

| Client      | Version tested                       | Verified on | Official sources                                                                                                           | Limitations                                                    |
| ----------- | ------------------------------------ | ----------- | -------------------------------------------------------------------------------------------------------------------------- | -------------------------------------------------------------- |
| Codex       | desktop/CLI current as of 2026-07-29 | Windows     | [MCP](https://learn.chatgpt.com/docs/extend/mcp), [config basics](https://learn.chatgpt.com/docs/config-file/config-basic) | Manual client smoke test requires a local client installation. |
| Claude Code | current docs checked 2026-07-29      | Windows     | [MCP](https://docs.anthropic.com/en/docs/claude-code/mcp)                                                                  | Manual client smoke test requires Claude Code.                 |

## Prerequisites

Use Node 24 and pnpm 10.2.0, install dependencies, and run `pnpm build:node`.

## Isolated validation database

Set `RELAY_DB_PATH` to `__RELAY_CHECKOUT__/.relay-validation/relay.db` for first validation.

## Canonical MCP and CLI entry points

See [generic MCP](../integrations/generic-mcp/README.md) and [generic CLI](../integrations/generic-cli/README.md). MCP tools include `relay_health`, `task_capture`, `task_list`, `task_get`, `task_find_similar`, and `session_captures_list`.

## Session and provenance example

Use a new valid session ID such as `relay-check-20260729-001` and retain it for capture and session lookup. Supply agent and workspace metadata through the documented adapter.

## Validation workflow

Build, configure one client manually, reload it, discover Relay tools, capture one disposable task, then retrieve that exact session.

## Disable and removal semantics

Remove only the client configuration and canonical-skill references. The SQLite database remains untouched.

## Current limitations

These source-checkout assets do not install packages, edit client configuration automatically, publish marketplace artifacts, or provide a daemon.

Manual client smoke tests were not performed in this environment on 2026-07-29: Codex CLI was blocked by an access-denied executable and Claude Code was not installed. Consequently, no client version, tool-discovery evidence, session ID, database path, or removal result is asserted here; these remain release-review gates for a clean checkout.
