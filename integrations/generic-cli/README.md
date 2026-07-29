# Generic CLI integration

Use the CLI when MCP is unavailable or for an explicit one-shot operation. Build first, use the same isolated `RELAY_DB_PATH`, and parse only `--output json` stdout. For example:

```bash
node __RELAY_CHECKOUT__/dist/cli/main.js task capture --title "Disposable integration check" --agent generic-cli --session relay-check-20260729-001 --workspace relay --source-context "Issue 24 validation" --output json
node __RELAY_CHECKOUT__/dist/cli/main.js session captures --session relay-check-20260729-001 --output json
node __RELAY_CHECKOUT__/dist/cli/main.js task triage TASK_ID --to BACKLOG --output json
node __RELAY_CHECKOUT__/dist/cli/main.js task complete TASK_ID --output json
node __RELAY_CHECKOUT__/dist/cli/main.js task archive TASK_ID --output json
```

Exit codes are documented in [the CLI reference](../../docs/cli-reference.md). Capture can be autonomous; edit, triage, start, complete, and archive require explicit user direction. See [Relay Capture](../../skills/relay-capture/SKILL.md) and [Relay Session Review](../../skills/relay-session-review/SKILL.md). Removing a client integration does not delete data; the SQLite database remains untouched.
