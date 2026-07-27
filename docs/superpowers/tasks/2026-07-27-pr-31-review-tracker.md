# PR #31 Review Task Tracker

Source: [Luna remediation plan](https://github.com/krishna916/relay/pull/31#issuecomment-5093695935) and the unresolved cleanup thread.

Scope: complete every actionable review task while preserving the issue #22 CLI contract, draft PR state, direct `TaskApplication` calls, and the review's out-of-scope boundaries.

## Working rules

- [x] Use test-first changes and keep each task independently verifiable.
- [x] Do not add HTTP calls, MCP process spawning, direct SQLite access, publication, installers, setup/doctor/update commands, shell completion, TUI work, or vendor-specific assets.
- [x] Do not post GitHub replies, resolve the review thread, or change draft state.

## Task 1 - Strict parsed-command model

- [x] Extract parsing into `src/interfaces/cli/parse-cli.ts` and define a discriminated union for all ten commands.
- [x] Validate IDs, required options, explicit allowlists, values, duplicates, enums, limits, edit conflicts, and JSON output before runtime creation.
- [x] Validate canonical task priorities and statuses without unsafe casts.
- [x] Ensure execution receives only validated typed commands and has no usage checks.
- [x] Add parser tests for valid invocations and the listed failure categories.
- [x] Confirm parser failures emit one envelope, one diagnostic, exit `2`, and do not create a runtime.

## Task 2 - Focused command handlers

- [x] Split execution into focused handlers under `src/interfaces/cli/commands/` with an exhaustive dispatcher.
- [x] Keep handlers free of persistence/runtime knowledge and stdout/stderr writes.
- [x] Preserve duplicate lookup-before-create, AGENT provenance, session/workspace/source context, warnings, and mutation metadata.
- [x] Add handler tests for reads, capture, nullable clears, no-op edits, duplicate candidates, filters, triage, and lifecycle operations.

## Task 3 - Adapter-neutral shared mappings

- [x] Move task DTO, match-reason, and change-metadata mappers to `src/interfaces/contracts/`.
- [x] Update MCP, HTTP, and CLI imports without duplicating implementations.
- [x] Add an architectural assertion that CLI files do not import from `interfaces/mcp`.
- [x] Preserve existing MCP behavior and tests.

## Task 4 - Exactly one JSON envelope

- [x] Separate parse, runtime creation, execution, cleanup, and final emission phases.
- [x] Defer output until execution and cleanup outcomes are captured and close runtime exactly once.
- [x] Preserve command errors over cleanup errors and map cleanup-only failures to one internal failure.
- [x] Keep stdout protocol-only and stderr diagnostic-only with no low-level details.
- [x] Add writer-spy tests for success/failure with successful/throwing cleanup, runtime creation failure, and parser failure, covering `run-cli.ts:44`.

## Task 5 - Stable errors and exit codes

- [x] Verify exit codes `0` through `5` against the canonical error hierarchy.
- [x] Avoid classifying unexpected errors as validation.
- [x] Assert deterministic public codes/messages, warning success behavior, one failure envelope, and success stderr silence.
- [x] Add representative tests for usage, invalid request, not found, archived, conflict, storage, unexpected, and duplicate-warning cases.

## Task 6 - MCP/CLI parity integration

- [x] Add `tests/integration/mcp-cli-parity.test.ts` with isolated deterministic fixtures.
- [x] Cover capture, duplicate warning, list, get, find-similar, session captures, edit, clear, no-op, all triage targets, start, complete, archive, not-found, and conflict.
- [x] Compare semantic task DTOs, warnings, and change metadata rather than transport wrappers.

## Task 7 - Built-process CLI integration

- [x] Add built-artifact tests invoking `dist/cli/main.js` with `process.execPath`.
- [x] Run from a non-repository CWD with an isolated `RELAY_DB_PATH`.
- [x] Verify persistence across processes, protocol output, exit codes, parser-before-storage behavior, and storage failure coverage.
- [x] Clean temporary directories/databases deterministically.

## Task 8 - Asset/build validation

- [x] Validate `relay -> ./dist/cli/main.js`, the CLI build entry, and the built artifact.
- [x] Extend repository asset validation for CLI source/build/bin/documentation consistency.
- [x] Update asset validation tests and preserve CWD-independent output.

## Task 9 - CLI documentation

- [x] Document source-checkout build, absolute-path invocation, `RELAY_DB_PATH`, all ten commands, every option, JSON-only mode, envelopes, exit codes, stdout/stderr, duplicate warnings, direct `TaskApplication` architecture, and out-of-scope behavior.
- [x] Remove stale planned/unsupported CLI claims from `README.md` and `docs/cli-reference.md`.

## Task 10 - Full verification gate

- [x] Run focused CLI unit tests, built CLI integration tests, and MCP/CLI parity tests.
- [x] Run formatting, lint, typecheck, coverage, build, asset validation, and `pnpm verify`.
- [x] Perform the final self-review checklist from the PR plan.
- [x] Record verification evidence and intentional deviations.

## Verification log

| Check                | Result | Evidence                                                                                                                                      |
| -------------------- | ------ | --------------------------------------------------------------------------------------------------------------------------------------------- |
| Baseline             | Pass   | Focused baseline, typecheck, and asset validation passed before implementation.                                                               |
| Focused review tests | Pass   | Parser 25, handlers 5, CLI errors 6, cleanup/output 6, architecture 1, asset validation 5, built CLI 2, parity 15.                            |
| Full suite           | Pass   | `pnpm test`: 32 files and 436 tests.                                                                                                          |
| Coverage             | Pass   | `pnpm test:coverage`: 88.74% statements, 81.34% branches, 88.94% functions, 90.90% lines.                                                     |
| Quality/build        | Pass   | `pnpm format:check`, `pnpm lint`, `pnpm typecheck`, `pnpm build`, and `pnpm validate:assets`.                                                 |
| Full gate            | Pass   | Escalated `pnpm verify` completed successfully; audit reported 1 low and 1 moderate vulnerability, below the high-severity failure threshold. |

## Final self-review

- [x] All ten commands are implemented.
- [x] Every command rejects unknown options.
- [x] All usage validation finishes before runtime creation.
- [x] CLI has no imports from `interfaces/mcp`.
- [x] Runtime is closed exactly once.
- [x] Cleanup failure cannot produce a second JSON document.
- [x] stdout contains only one JSON envelope and newline.
- [x] stderr contains no success output.
- [x] All six exit-code categories are tested.
- [x] Built CLI works from a non-repository CWD.
- [x] Separate CLI processes use the same `RELAY_DB_PATH` database.
- [x] MCP/CLI parity tests pass.
- [x] Asset validation covers the new executable.
- [x] `pnpm verify` passes.
- [x] No forbidden scope was added.
