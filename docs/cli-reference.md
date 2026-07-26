# Relay CLI Contract Reference

This document is reserved by issue #19 and is governed by `docs/decisions/0002-agent-integration-contracts.md` and `docs/superpowers/plans/2026-07-26-agent-integration-contracts.md`.

The source-checkout CLI is implemented by issue #22. Issue #19 defines the stable future-facing command shape:

```text
relay task capture
relay task list
relay task get <id>
relay task find-similar
relay task edit <id>
relay task triage <id>
relay task start <id>
relay task complete <id>
relay task archive <id>
relay session captures
```

Agent-facing commands must support deterministic JSON output with schema version `1`. JSON output is authoritative; diagnostics go to stderr. Do not introduce a generic unrestricted status command.
