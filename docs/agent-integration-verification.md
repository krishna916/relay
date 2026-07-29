# Agent Integration Verification

## Scope and safety statement

This evidence covers the source-checkout Relay MCP and CLI adapters, their shared task contract, the HTTP database path, and the canonical integration assets for issue #25. All automated scenarios use a fresh disposable database under the repository's `tmp/` directory and arbitrary disposable working directories. No test invokes an external LLM, reads or writes the default Relay database, or changes real Codex, Claude Code, or other client configuration. MCP diagnostics are captured from stderr; protocol data remains on stdout.

## Automated scenario matrix

| Scenario                                                            | Automated test or manual step                                                | Result | Evidence                                                                                          |
| ------------------------------------------------------------------- | ---------------------------------------------------------------------------- | ------ | ------------------------------------------------------------------------------------------------- |
| 1. MCP capture then CLI retrieval                                   | `mcp-cli-parity.test.ts` — MCP capture followed by built CLI get             | PASS   | Built `dist/mcp/main.js` and `dist/cli/main.js`, same disposable `RELAY_DB_PATH`                  |
| 2. CLI capture then MCP retrieval                                   | `mcp-cli-parity.test.ts` — CLI capture followed by MCP get                   | PASS   | Complete public task DTO equality                                                                 |
| 3. Task list/get fields and ordering                                | `mcp-cli-parity.test.ts` — list DTO comparison and persisted ordering        | PASS   | Transport-only envelope normalization                                                             |
| 4. Session-ID isolation                                             | `agent-workflow-e2e.test.ts` — alpha and beta captures                       | PASS   | Exact session filtering                                                                           |
| 5. Completed and archived session review                            | `agent-workflow-e2e.test.ts` — all-status review                             | PASS   | Open, DONE, and ARCHIVED captures returned                                                        |
| 6. Missing session behavior                                         | `mcp-cli-parity.test.ts` and existing adapter contract tests                 | PASS   | Stable missing-task/session contract coverage                                                     |
| 7. Malformed session behavior                                       | `mcp-cli-parity.test.ts` and existing strict schema tests                    | PASS   | MCP validation boundary and CLI validation envelope                                               |
| 8. Duplicate candidates, warnings, and match reasons                | `mcp-cli-parity.test.ts` — duplicate capture and find-similar                | PASS   | Advisory warning and deterministic candidate assertions                                           |
| 9. Edit parity                                                      | `mcp-cli-parity.test.ts` — CLI edit and MCP readback                         | PASS   | Complete task and change metadata                                                                 |
| 10. Triage/start/complete/archive parity                            | `mcp-cli-parity.test.ts` — cross-adapter lifecycle sequence                  | PASS   | Focused lifecycle actions and statuses                                                            |
| 11. No-op metadata                                                  | `mcp-cli-parity.test.ts` — repeated edit                                     | PASS   | `NO_CHANGE`, empty fields, unchanged timestamps                                                   |
| 12. Validation, transition, archived, not-found, and storage errors | `mcp-cli-parity.test.ts` — stable errors and unusable parent path            | PASS   | CLI envelopes; MCP execution/protocol errors; startup failure remains stderr-only; leakage checks |
| 13. CLI JSON schemas and exit codes                                 | `cli-test-process.test.ts` and built parity tests                            | PASS   | One JSON document, separated stderr, exit codes 0/2/3/4/5                                         |
| 14. One database across HTTP, MCP, and CLI                          | `database-path-parity.test.ts`                                               | PASS   | Arbitrary CWDs, HTTP runtime, restart persistence, no CWD-local DB                                |
| 15. Skill and vendor-wrapper drift                                  | `validate-agent-integration-assets.test.ts` and `validate:assets`            | PASS   | 33 validator tests; canonical policy and entry-point checks                                       |
| 16. Integration removal preserves data                              | `agent-workflow-e2e.test.ts` config-driven disposable MCP launch and removal | PASS   | Parsed `.mcp.json` launches the built server; removal is followed by retrieval from the same DB   |

## Clean-checkout environment

- OS: Microsoft Windows NT 10.0.26200.0
- Node: v24.18.0
- pnpm: 10.2.0 through Corepack (`corepack pnpm --version`); direct global pnpm was 11.9.0 and was not used for authoritative final commands.
- Branch: `feature/issue-25-mcp-cli-compatibility`
- Verification base SHA: `e51307d066e70b95f8072ac52d2679b8e63c5244`
- Database strategy: each test calls `createAgentTestRuntime()` and uses a unique disposable `<root>/data/relay.db`; client CWDs are created below the same disposable root.

Exact setup and validation commands:

```text
corepack pnpm install --frozen-lockfile
corepack pnpm build
corepack pnpm exec vitest run tests/integration/mcp-cli-parity.test.ts
corepack pnpm exec vitest run tests/integration/agent-workflow-e2e.test.ts
corepack pnpm exec vitest run tests/integration/database-path-parity.test.ts
corepack pnpm validate:assets
corepack pnpm verify
git status --short
```

The disposable strategy and assertions confirm that the default database and real client configuration were not touched.

## Codex validation

Live validation is unverified. `Get-Command codex` resolved the installed desktop executable, but `codex --version` failed with Windows `Access is denied`. No Codex process was started, no MCP discovery result is claimed, and no Codex configuration or profile was changed.

The required isolated workflow remains:

1. Use a clean checkout and `corepack pnpm install --frozen-lockfile`.
2. Run `corepack pnpm build`.
3. Create an isolated profile/configuration and disposable `RELAY_DB_PATH`.
4. Add the canonical `node <checkout>/dist/mcp/main.js` server using the documented Codex configuration.
5. Install the canonical skills unchanged under `.agents/skills/`.
6. Restart Codex, discover Relay tools, capture two follow-ups with one session ID, review that session, perform one explicitly directed lifecycle action, use the CLI JSON fallback, remove only config/skill references, and confirm data remains.

No step above is represented as executed in this environment.

## Claude Code validation

Live validation is unverified. `Get-Command claude` and `Get-Command claude-code` returned no executable. No Claude configuration was edited and no client result is claimed.

The equivalent isolated workflow is documented in `integrations/claude-code/README.md`: project-scoped stdio configuration, canonical `.claude/skills/` directories, tool discovery, two same-session captures, exact session review, one explicitly directed mutation, CLI fallback, configuration-only removal, and post-removal data retrieval.

## Cross-client differences and limitations

The automated contract is client-neutral: built MCP uses protocol-owned stdout and CLI uses one JSON envelope plus stable exit codes. Codex and Claude Code syntax, skill-discovery locations, and availability could not be exercised live here. The issue #24 documentation records the official-source verification date and the current unavailable-client limitations.

## Data and configuration preservation

Automated tests only create disposable files under the test runtime root. They remove temporary configuration fixtures and restart against the same database, then retrieve persisted tasks. They never remove a database to disable an integration. The validator rejects removal guidance that deletes SQLite data and requires explicit configuration-only wording.

## Epic #2 closure checklist

- [x] Issues #19, #20, #21, #22, #23, #24, and #26 are closed on GitHub and their required artifacts exist locally.
- [x] Built MCP and CLI entry points are exercised from arbitrary working directories.
- [x] MCP stdout remains protocol-clean; diagnostics are stderr-only.
- [x] Automated contract, lifecycle, session, error, storage, restart, shared-path, and asset checks pass.
- [x] Default database, real client configuration, and external LLMs were not touched by automation.
- [ ] Live Codex workflow — blocked by executable access denied; human review required.
- [ ] Live Claude Code workflow — blocked because the client is unavailable; human review required.
- [ ] Human reviewer must inspect cleanup, normalizers, source-context safety, and one independent client workflow before merging.
