# ADR 0002: Agent Integration Contracts

## Status

Proposed for review under GitHub issue #19.

## Context

Relay needs stable, shared contracts before MCP and CLI task adapters are implemented. The adapters must expose equivalent lifecycle intent, preserve agent provenance and session context, reuse application services, and remain compatible with later packaging.

## Decision

- MCP over stdio is the preferred structured agent integration.
- A short-lived CLI is a first-class fallback and debugging surface.
- MCP and CLI call the same application services and do not access SQLite directly.
- Contract schema version starts at integer `1`; tool names are not version-prefixed.
- Session identity is an opaque caller-generated `sessionId` stored as task metadata, with no session table.
- Agent capture requires `createdByName` and `sessionId`, always creates an `AGENT` task in `INBOX`, and does not accept caller-controlled creator type or status.
- Session review queries tasks by exact persisted `sessionId` and agent creator type, ordered by original capture order.
- Existing-task mutation tools and commands are intent-specific and may be invoked only after explicit user direction.
- Relay does not add a fake confirmation or authorization field because conversational intent cannot be authenticated under the local OS-user trust model.
- Duplicate handling is advisory, bounded, and based on lightweight normalized-title matching.
- CLI JSON uses schema-versioned success/error envelopes and stable exit-code categories.
- MCP, CLI, HTTP, UI, migrations, and tests reuse the existing shared database-path resolver.
- The future executable surface is one `relay` command with `mcp`, `ui`, `doctor`, `task`, and `session` subcommands.

## Consequences

### Positive

- One behavioural contract serves MCP, CLI, skills, tests, and packaging.
- Agents receive deterministic machine-readable results.
- Session review works across short-lived processes without a daemon.
- Mutation safety remains honest about the trust boundary.
- Later packaging can expose the same command surface without redesign.

### Costs

- The task model and database require a nullable `sessionId` migration in downstream implementation.
- Session and duplicate queries require new application/repository capabilities.
- MCP and CLI parity must be maintained through shared fixtures and tests.

## Rejected Alternatives

### Persisted session entity

Rejected for Epic #2 because Relay only needs grouping metadata and explicit review. Session lifecycle, timers, and state would add unnecessary persistence and concurrency rules.

### Confirmation boolean or user-request text on mutations

Rejected because an agent can populate either value itself. It would not provide authorization and could create false confidence.

### Generic task update/status command

Rejected because it obscures lifecycle intent and makes autonomy boundaries harder to review and test.

### Semantic duplicate detection

Rejected because embeddings or fuzzy-search infrastructure are disproportionate to the advisory MVP requirement.

## Related Work

- Issue #19 defines detailed MCP, CLI, session, error, and output contracts.
- Issue #20 adds session persistence/query support and safe MCP capture/read capabilities.
- Issue #22 implements the CLI using the same contracts.
- Epic #18 packages the stable executable surface.
