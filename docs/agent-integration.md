# Agent Integration

## Supported installed model

Installed integrations invoke the stable command `relay mcp`. Use `relay setup --client codex --config-file <absolute-path>` or the equivalent Claude Code command to preview a change, then add `--apply` only after reviewing the exact target, operation, and snippet. Generic MCP remains snippet-only.

For source development only, run the built entries from an absolute source checkout: `node __RELAY_CHECKOUT__/dist/mcp/main.js` or `node __RELAY_CHECKOUT__/dist/cli/main.js`. These source-checkout examples are intentionally separate from installed templates.

For source development only, run `pnpm dev:mcp` from the checkout; vendor configuration should use the built Node entry so it is independent of the current working directory.

## Compatibility verification

| Client      | Official documentation verified | Live smoke test | Evidence                                                                                                   |
| ----------- | ------------------------------- | --------------- | ---------------------------------------------------------------------------------------------------------- |
| Codex       | 2026-07-29                      | Not completed   | Local Codex executable was blocked by an access-denied error; no tool-discovery or task result is claimed. |
| Claude Code | 2026-07-29                      | Not completed   | Claude Code was unavailable to the maintainer; no tool-discovery or task result is claimed.                |

Official sources checked on 2026-07-29: [Codex MCP documentation](https://learn.chatgpt.com/docs/extend/mcp), [Codex configuration basics](https://learn.chatgpt.com/docs/config-file/config-basic), [Claude Code MCP documentation](https://code.claude.com/docs/en/mcp), and [Claude Code skills documentation](https://code.claude.com/docs/en/skills).

## Prerequisites

Use Node 24 and pnpm 10.2.0, install dependencies, and run `pnpm build:node`.

## Isolated validation database

Set `RELAY_DB_PATH` to `__RELAY_CHECKOUT__/.relay-validation/relay.db` for first validation.

## Canonical MCP and CLI entry points

See [generic MCP](../integrations/generic-mcp/README.md) and [generic CLI](../integrations/generic-cli/README.md). Installed configuration uses `relay mcp`; source-checkout validation uses the explicit built Node entry above.

## Session and provenance example

Use a new valid session ID such as `relay-check-20260729-001` and retain it for capture and session lookup. Supply agent and workspace metadata through the documented adapter.

## Validation workflow

Build, configure one client manually, reload it, discover Relay tools, capture one disposable task, then retrieve that exact session.

## Disable and removal semantics

Remove only the client configuration and canonical-skill references. The SQLite database remains untouched.

## Deferred live validation

Official documentation was verified on 2026-07-29 using the four links in the compatibility section. Claude Code was unavailable to the maintainer, so no live tool-discovery, task-capture, exact-session retrieval, or removal test was performed. The following checklist must be run in a real Claude Code environment before this acceptance gate is closed:

1. Start from a clean Relay checkout.
2. Select Node 24 and pnpm 10.2.0.
3. Run `pnpm install --frozen-lockfile`.
4. Run `pnpm build:node`.
5. Create a disposable absolute `RELAY_DB_PATH`.
6. Add Relay as a project-local Claude MCP stdio server.
7. Install the canonical skills under `.claude/skills/`.
8. Restart Claude Code.
9. Confirm `relay_health` is discovered and succeeds.
10. Confirm `task_capture`, `task_list`, `task_get`, `task_find_similar`, and `session_captures_list` are discovered.
11. Capture one disposable task using a new exact session ID.
12. Retrieve that exact session and confirm the task is returned.
13. Remove only the MCP entry and Relay skill directories.
14. Confirm the SQLite database file still exists and the task remains stored.
15. Record Claude Code version, OS, commands, session ID, database path, results, and limitations.

## Current limitations

These source-checkout assets do not install packages, edit client configuration automatically, publish marketplace artifacts, or provide a daemon.

Manual client smoke tests were not performed in this environment on 2026-07-29. Consequently, no client version, tool-discovery evidence, session ID, database path, or removal result is asserted here; these remain release-review gates for a clean checkout.
