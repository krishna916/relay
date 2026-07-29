# PR #34 Review Task Tracker

Source: [Luna remediation implementation plan](https://github.com/krishna916/relay/pull/34#issuecomment-5122267820)

Scope: complete every actionable task in the linked plan while preserving issue #25's acceptance claims, application contracts, adapter schemas, database defaults, canonical skills, and vendor policies.

## Working rules

- [x] Verify each task against the current checkout before editing.
- [x] Keep implementation changes limited to the files named by the plan, plus this requested local tracker.
- [x] Use test-first changes and record focused evidence for each task.
- [x] Do not commit `dist/`, coverage output, temporary runtimes, or default Relay data.
- [x] Do not modify client configuration or claim live Codex/Claude validation without evidence.
- [x] Do not reply to or resolve the GitHub review thread unless explicitly requested after local work is complete.

## Task 1 - Build Node artifacts before process tests

- [x] Record the clean-state baseline failure: with `dist/` absent, the pre-fix command ran Vitest without built entries and reported 19 failed tests across 4 failed suites.
- [x] Update only `test` and `test:coverage` scripts to build Node artifacts first.
- [x] Run the focused CLI process test with `dist/` initially absent.
- [x] Run the focused MCP coverage test with `dist/` initially absent.
- [x] Commit the focused Task 1 change as `5142625`.

## Task 2 - Create the repository temporary parent

- [x] Add the missing-parent regression test before implementation.
- [x] Confirm the regression test fails with the expected `ENOENT` baseline.
- [x] Create `<checkout>/tmp` recursively before `mkdtemp()`.
- [x] Preserve generated-root-only cleanup and path-escape protections.
- [x] Run focused runtime tests and typecheck.
- [x] Commit the focused Task 2 change as `b3703ca`.

## Task 3 - Verify structured MCP/CLI storage-error parity

- [x] Replace startup-rejection coverage with a post-initialization locked-database test.
- [x] Run CLI and MCP writes concurrently against the same `BEGIN IMMEDIATE` lock.
- [x] Assert CLI exit code `5`, structured `STORAGE_ERROR`, MCP structured `STORAGE_ERROR`, normalized equality, and sanitized output.
- [x] Run the complete MCP/CLI parity file.
- [x] Commit the focused Task 3 change as `cc3380a`.

## Task 4 - Correct evidence claims

- [x] Update scenario 12 to describe the verified locked-database parity evidence.
- [x] Remove the old unusable-parent/startup-rejection parity claim.
- [x] Run formatting and repository asset validation.
- [x] Commit the focused Task 4 change as `e190f1f`.

## Task 5 - Clean-state verification and reconciliation

- [x] Run `corepack pnpm install --frozen-lockfile` successfully with the pinned pnpm 10.2.0 toolchain after the initial sandbox relink permission failure was retried with filesystem escalation.
- [x] Verify `corepack pnpm test` works after generated output is removed: 39 files/512 tests passed and `dist/` was recreated by the script.
- [x] Verify `corepack pnpm test:coverage` works after generated output is removed: `verify` started from deleted `dist/`, rebuilt Node artifacts first, and completed coverage successfully.
- [x] Run `corepack pnpm verify` from a clean generated-output state: passed formatting, lint, typecheck, 512 tests, coverage, builds, asset validation, and the high-severity audit gate.
- [x] Run the three focused issue #25 integration suites: MCP/CLI parity 25 passed; agent workflow 3 passed; database-path parity 2 passed.
- [x] Confirm the worktree contains no tracked generated output or disposable runtime changes; only pre-existing `.codegraph/` remains outside the task and the tracker is the requested local artifact.
- [x] Reconcile this tracker against the final acceptance checklist below.
- [x] Keep PR claims/documentation honest; do not publish GitHub replies or resolve the thread in this pass.

## Verification log

| Check                 | Result | Evidence                                                                                                                                                                                                                                                                        |
| --------------------- | ------ | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Baseline              | Pass   | PR #34 comment and review context fetched; branch is `feature/issue-25-mcp-cli-compatibility`; only pre-existing untracked `.codegraph/` is outside this task.                                                                                                                  |
| Task 1 focused checks | Pass   | Clean `dist/` then `corepack pnpm test -- tests/unit/support/cli-test-process.test.ts`: 39 files/511 tests passed; clean `dist/` then `corepack pnpm test:coverage -- tests/unit/support/mcp-test-client.test.ts`: 39 files/511 tests passed; coverage 88.74/81.34/88.94/90.90. |
| Task 2 focused checks | Pass   | Red regression produced `ENOENT`; `vitest run tests/unit/support/agent-test-runtime.test.ts`: 3 tests passed; `corepack pnpm typecheck`: passed.                                                                                                                                |
| Task 3 focused checks | Pass   | Focused lock test: 1 passed/24 skipped; complete `mcp-cli-parity.test.ts`: 25 passed.                                                                                                                                                                                           |
| Task 4 checks         | Pass   | `corepack pnpm format:check` passed; `corepack pnpm validate:assets` passed.                                                                                                                                                                                                    |
| Full clean-state gate | Pass   | `corepack pnpm verify` from deleted `dist/`: 39 files, 512 tests, 88.74% statements / 81.34% branches / 88.94% functions / 90.90% lines; build, assets, and audit gate passed.                                                                                                  |

## Final acceptance checklist

- [x] `pnpm test` works when `dist/` is initially absent.
- [x] `pnpm test:coverage` works when `dist/` is initially absent.
- [x] `corepack pnpm verify` passes from a clean generated-output state.
- [x] `createAgentTestRuntime()` succeeds when `<checkout>/tmp` is initially absent.
- [x] Runtime cleanup removes the generated unique directory and SQLite sidecars.
- [x] Storage failure occurs after MCP initialization, not during transport startup.
- [x] CLI returns exit code `5` and structured `STORAGE_ERROR`.
- [x] MCP returns structured `STORAGE_ERROR`.
- [x] Normalized CLI and MCP storage errors are equal.
- [x] External output contains no SQL, stack, database path, or user-directory leakage.
- [x] Documentation claims match the verified behavior; live Codex/Claude validation remains explicitly unverified.
- [x] Existing 80% coverage thresholds and all quality gates remain unchanged.

## Publication status

Local implementation and verification only. GitHub review replies/thread resolution are intentionally not performed by this tracker unless separately requested.
