# Codex integration

Build Relay, replace `__RELAY_CHECKOUT__` with an absolute path, create `.relay-validation`, then add the template to trusted project `.codex/config.toml` or user `~/.codex/config.toml`. Restart Codex and use `/mcp` or `codex mcp list` to confirm Relay. Verify `relay_health`, the five read/capture tools, a disposable capture, and exact-session retrieval. The JSON CLI fallback is in [generic CLI](../generic-cli/README.md).

Install the canonical [Relay Capture](../../skills/relay-capture/SKILL.md) and [Relay Session Review](../../skills/relay-session-review/SKILL.md) as repository skills by copying their directories to `.agents/skills/relay-capture/` and `.agents/skills/relay-session-review/`; Codex discovers repository skills from `.agents/skills` after a new session. Do not copy their policy into this README. Remove the Relay MCP configuration and those skill directories to disable it. The SQLite database remains untouched.
