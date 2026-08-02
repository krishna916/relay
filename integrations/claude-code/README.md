# Claude Code integration

Use `relay setup --client claude-code --config-file <absolute-path>` to preview the exact JSON entry, then add `--apply` only after reviewing a disposable or reviewed file. The generated entry invokes `relay mcp`; no client-file discovery occurs. The source-checkout command remains documented separately for repository development. `local` is private to the current project, `project` is shared through `.mcp.json`, and `user` applies across projects; local takes priority.

Install the canonical [Relay Capture](../../skills/relay-capture/SKILL.md) and [Relay Session Review](../../skills/relay-session-review/SKILL.md) skill directories by copying or symlinking them unchanged to `.claude/skills/relay-capture/` and `.claude/skills/relay-session-review/`. For a personal installation across projects, use the client’s documented user-scoped skills directory. Do not copy the policy text into Claude-specific documentation or use instruction-file imports as skill discovery.

Use `claude mcp list`, `claude mcp get relay`, and `/mcp` to validate and authorize the server. Confirm `relay_health`, the task tools, a disposable capture, and the exact session lookup when live validation is available. Remove only the client configuration with `claude mcp remove relay` or by deleting the Relay entry and skill directories; the SQLite database remains untouched.

For current syntax and skill discovery behavior, see the [Claude Code MCP documentation](https://code.claude.com/docs/en/mcp) and [Claude Code skills documentation](https://code.claude.com/docs/en/skills).
