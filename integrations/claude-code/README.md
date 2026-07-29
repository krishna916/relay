# Claude Code integration

Build Relay and substitute an absolute checkout path. Add the stdio server with `claude mcp add --transport stdio --scope project --env RELAY_DB_PATH=ABSOLUTE_CHECKOUT/.relay-validation/relay.db relay -- node ABSOLUTE_CHECKOUT/dist/mcp/main.js`, or copy the template to the project root as `.mcp.json`. `local` is private to the current project, `project` is shared through `.mcp.json`, and `user` applies across projects; local takes priority. Set the same isolated `RELAY_DB_PATH` in the selected configuration.

Install the canonical [Relay Capture](../../skills/relay-capture/SKILL.md) and [Relay Session Review](../../skills/relay-session-review/SKILL.md) skill directories by copying or symlinking them unchanged to `.claude/skills/relay-capture/` and `.claude/skills/relay-session-review/`. For a personal installation across projects, use the client’s documented user-scoped skills directory. Do not copy the policy text into Claude-specific documentation or use instruction-file imports as skill discovery.

Use `claude mcp list`, `claude mcp get relay`, and `/mcp` to validate and authorize the server. Confirm `relay_health`, the task tools, a disposable capture, and the exact session lookup when live validation is available. Remove it with `claude mcp remove relay` or by deleting the Relay entry and skill directories; the SQLite database remains untouched.

For current syntax and skill discovery behavior, see the [Claude Code MCP documentation](https://code.claude.com/docs/en/mcp) and [Claude Code skills documentation](https://code.claude.com/docs/en/skills).
