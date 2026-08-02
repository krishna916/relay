# Codex integration

Use `relay setup --client codex --config-file <absolute-path>` to preview the exact Relay entry, then add `--apply` to mutate a disposable or reviewed Codex file. The generated entry is `command = "relay"` with `args = ["mcp"]`; no client-file discovery occurs. Restart Codex and use `/mcp` or `codex mcp list` to confirm Relay. The source-checkout fallback and JSON CLI are documented in [generic CLI](../generic-cli/README.md).

Install the canonical [Relay Capture](../../skills/relay-capture/SKILL.md) and [Relay Session Review](../../skills/relay-session-review/SKILL.md) as repository skills by copying their complete directories unchanged to `.agents/skills/relay-capture/` and `.agents/skills/relay-session-review/`; Codex discovers repository skills from `.agents/skills` after a new session. Do not copy their policy into this README. Remove the Relay configuration and those skill directories to disable it. The SQLite database remains untouched.
