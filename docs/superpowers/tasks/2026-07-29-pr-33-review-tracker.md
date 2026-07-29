# PR #33 Review Task Tracker

Source: [Luna remediation implementation plan](https://github.com/krishna916/relay/pull/33#issuecomment-5112744124)

Scope: address every actionable item in the linked plan while preserving Relay's MCP, CLI, task, session, persistence, and data-preserving removal contracts. The PR remains draft while the unavailable Claude Code live validation is explicitly deferred.

## Working rules

- [x] Verify each review item against the current checkout before editing.
- [x] Keep canonical behavioural guidance only in `skills/relay-capture/SKILL.md` and `skills/relay-session-review/SKILL.md`.
- [x] Keep `dist/mcp/main.js` as the only canonical MCP server entry.
- [x] Do not automatically edit client configuration or remove Relay SQLite data.
- [x] Do not claim Codex or Claude Code live validation without recorded evidence.

## Task 1 - Format the existing Issue #24 plan

- [x] Format `docs/superpowers/plans/2026-07-29-issue-24-agent-integration-assets.md` with Prettier.
- [x] Remove the unresolved marker that blocked repository asset validation.
- [x] Run `pnpm format:check`.
- [x] Commit the formatting change separately as `5449b89`.

## Task 2 - Correct Claude Code skill installation guidance

- [x] Require project-local `.claude/skills/relay-capture/SKILL.md` and `.claude/skills/relay-session-review/SKILL.md` destinations.
- [x] Document optional personal skill destinations without presenting instruction-file imports as skill discovery.
- [x] Instruct copying or symlinking complete canonical skill directories unchanged.
- [x] Add validator tests for `CLAUDE.md`-only guidance and missing project skill paths.
- [x] Update the real README, fixture, validator, and focused tests.

## Task 3 - Remove contradictory compatibility claims

- [x] Separate official documentation verification, live smoke-test status, and evidence in the compatibility table.
- [x] Reject contradictory `Version tested`/unperformed-smoke-test fixtures.
- [x] Update the real and fixture documentation.
- [x] Keep the PR manual-validation wording honest.

## Task 4 - Explicitly defer unavailable Claude Code live validation

- [x] Add a clearly titled deferred-validation section with the verification date and exact official documentation links.
- [x] Record that Claude Code was unavailable and no live discovery, capture, retrieval, or removal test was performed.
- [x] Record the exact 15-step future validation checklist.
- [ ] Leave the live checklist unresolved until a real Claude Code environment supplies evidence.
- [x] Keep PR #33 in draft while this acceptance gate remains unmet.

## Task 5 - Keep TOML validation development-only

- [x] Move `@iarna/toml` from `dependencies` to `devDependencies`.
- [x] Regenerate the lockfile and run typecheck plus focused validator tests.
- [x] Confirm production entry points do not import the validator dependency.

## Task 6 - Remove unrelated CodeGraph scope

- [x] Remove `.codegraph/.gitignore` from the PR.

## Task 7 - Strengthen deterministic integration-asset validation

- [x] Validate Claude and Codex project skill paths.
- [x] Reject unperformed live-test claims and contradictory compatibility wording.
- [x] Validate command/argument separation, exact `dist/mcp/main.js` paths, and absence of machine-specific home paths.
- [x] Validate both canonical skill references, data-preserving removal guidance, and future-only `relay mcp` wording.
- [x] Validate the exact currently shipped MCP tool list, including the five mutation tools.
- [x] Add focused positive and negative fixture coverage.

## Task 8 - Verify, publish commits, and record PR status

- [x] Run focused validator and repository-asset tests.
- [x] Run the authoritative `pnpm verify` gate.
- [x] Update PR #33 description with commands, official sources, honest live-validation status, and the deferred Claude checklist.
- [x] Push all reviewed commits.
- [ ] Confirm the latest GitHub Actions run for the pushed head.
- [x] Leave the PR as draft.

## Verification log

| Check                   | Result  | Evidence                                                                                                                                                                                                            |
| ----------------------- | ------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Baseline inspection     | Pass    | Clean working tree on `feature/issue-24-agent-integration-assets`; linked comment fetched from PR #33.                                                                                                              |
| Focused validator tests | Pass    | `corepack pnpm exec vitest run tests/unit/scripts/validate-agent-integration-assets.test.ts`: 13 passed; aggregate run: 23 passed.                                                                                  |
| Repository asset tests  | Pass    | `node --import tsx/esm scripts/validate-repository-assets.ts` passed.                                                                                                                                               |
| Full `pnpm verify` gate | Pass    | 34 files, 469 tests, coverage 88.74% statements / 81.34% branches / 88.94% functions / 90.90% lines; build and asset validation passed; audit reported 1 low and 1 moderate vulnerability below the high threshold. |
| GitHub Actions          | Pending | `verify` is running for head `3bf4ce1`; CodeRabbit skipped review because the PR is draft.                                                                                                                          |

## Publication status

The three verified commits `5449b89`, `35ebc28`, and `3bf4ce1` are pushed to `origin/feature/issue-24-agent-integration-assets`. The PR description is updated and PR #33 remains draft. GitHub Actions is the only remaining remote check.

## Deferred human gate

The Claude Code live smoke test cannot be performed in this environment because Claude Code is unavailable. This is recorded as an unresolved acceptance item, not as a successful test. The implementation and automated validation work may be complete while this human gate remains visibly deferred and PR #33 remains draft.

## Inline review follow-up

- [x] Verify and correct Claude Code and Codex skill-directory installation targets.
- [x] Require isolated `RELAY_DB_PATH` in validation guidance and CLI examples.
- [x] Add isolated database configuration to the accepted Codex fixture and reject fallback configuration.
- [x] Require Claude deferred/unavailable status, official-source evidence, limitations, and the complete 15-step future checklist in validation assets.
- [x] Reject Windows, macOS, Linux `/home/`, and `~/` machine-specific paths.
- [x] Align the accepted generic-MCP fixture with its supported five task tools plus `relay_health`.
- [x] Verify each finding with focused tests, then run the full repository gate.

## Inline review verification

All five inline findings were valid against the current checkout. No requested finding was skipped. Focused validator and repository-asset tests passed: 33 tests. The full `corepack pnpm verify` gate passed with 34 test files and 480 tests, coverage of 88.74% statements / 81.34% branches / 88.94% functions / 90.90% lines, successful build and asset validation, and audit findings of 1 low plus 1 moderate vulnerability below the high-severity threshold.
