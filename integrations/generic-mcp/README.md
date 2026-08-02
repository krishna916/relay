# Generic MCP integration

Run `relay setup --client generic-mcp` or `relay config snippet --client generic-mcp` to print the reviewed snippet. Generic MCP is snippet-only in this issue and never mutates a client file. The installed snippet invokes `relay mcp`; source-checkout validation remains documented separately and must use an explicitly isolated `RELAY_DB_PATH`.

Validation RELAY_DB_PATH must be explicit and isolated; omitting RELAY_DB_PATH is permitted only for non-validation use and selects Relay's platform default.

The stdio protocol requires clean stdout. Relay exposes exactly these MCP tools: `relay_health`, `task_capture`, `task_list`, `task_get`, `task_find_similar`, `session_captures_list`, `task_edit`, `task_triage`, `task_start`, `task_complete`, and `task_archive`. Restart or reload the client, capture one disposable task, and retrieve it by the same exact session ID.

Use [Relay Capture](../../skills/relay-capture/SKILL.md) and [Relay Session Review](../../skills/relay-session-review/SKILL.md) for behavioural guidance. To remove this integration, remove only the client configuration; the SQLite database remains untouched.
