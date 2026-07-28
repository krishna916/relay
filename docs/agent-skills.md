# Relay agent skills

Relay capabilities live in the [MCP contracts](mcp-tools.md) and [CLI reference](cli-reference.md); behavioural policy lives only in the canonical [Relay Capture](../skills/relay-capture/SKILL.md) and [Relay Session Review](../skills/relay-session-review/SKILL.md) skills.

MCP is preferred for supported interactive clients. The CLI is the JSON-only fallback for unsupported clients, scripts, debugging, or explicit one-shot use. Both use the same database and contracts, and one workflow retains one adapter unless it becomes unavailable.

The active agent session owns one opaque session ID. Captures and final review use that exact ID, while concurrent sessions remain isolated; see [session semantics](session-semantics.md).

Fixtures in `skills/fixtures/` are deterministic policy examples validated by `validateSkillAssets`; they are not live-model tests. Vendor integrations may reference or mechanically copy the canonical content, but may not independently alter policy. Vendor packaging, setup workflows, and live-LLM testing remain deferred.
