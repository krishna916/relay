# Generic MCP integration

Build Relay with `pnpm build:node`, replace `__RELAY_CHECKOUT__` in [server-config.json.example](server-config.json.example) with an absolute checkout path, then copy the command, arguments, and optional environment map into the client configuration. Keep command and arguments separate: do not use a shell or interpolation. Validation flows must set the isolated `RELAY_DB_PATH` shown in the template; omitting `RELAY_DB_PATH` is permitted only for non-validation use and then selects Relay's platform default.

The stdio protocol requires clean stdout. Relay exposes exactly these MCP tools: `relay_health`, `task_capture`, `task_list`, `task_get`, `task_find_similar`, `session_captures_list`, `task_edit`, `task_triage`, `task_start`, `task_complete`, and `task_archive`. Restart or reload the client, capture one disposable task, and retrieve it by the same exact session ID.

Use [Relay Capture](../../skills/relay-capture/SKILL.md) and [Relay Session Review](../../skills/relay-session-review/SKILL.md) for behavioural guidance. To remove this integration, remove only the client configuration; the SQLite database remains untouched.
