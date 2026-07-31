# PR #37 Follow-up Review Tracker

Branch: `feature/issue-36-linux-mcpb`

## Finding reconciliation

| Finding                                               | Current-code result                                                                                                                                     | Action                                                                                         |
| ----------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------- | ---------------------------------------------------------------------------------------------- |
| Linux evidence record lacks exact CI fields           | Valid; public job metadata exposes only `ubuntu-latest`, Node 24 setup, successful ordered steps, and no uploaded artifact.                             | Update the evidence document with available values and explicit incomplete/unavailable fields. |
| Claude Desktop guide uses `task_triage`               | Stale in this checkout; `task_triage` is registered, documented, and covered by MCP contract tests.                                                     | Skip; retain the supported explicit mutation and record the reason.                            |
| Verify transport stderr subscription order/null guard | Valid; subscription occurs before `client.connect()` and uses optional chaining.                                                                        | Move subscription after connect and throw if stderr is null.                                   |
| Verify cleanup preserves the original failure         | Valid; a rejected `client.close()` can replace the verification error.                                                                                  | Swallow `client.close()` rejection while preserving transport and temp-root cleanup.           |
| Lockfile parser should use an existing YAML parser    | Not applicable as written; no YAML parser exists in the current dependency graph, and the current regex successfully parses the real lockfile and CRLF. | Skip the dependency-expanding nitpick; add CRLF coverage as requested.                         |
| Pack reads the complete artifact and stats separately | Valid; `readFile()` loads the full bundle before a second `stat()` call.                                                                                | Read four bytes through a file handle and reuse one stat result.                               |
| Startup-failure probe should use `process.execPath`   | Stale; current code already passes `process.execPath` to `spawn()`.                                                                                     | Skip with no change.                                                                           |
| Linux MCPB integration tests need explicit timeouts   | Valid; neither process-spawning test has a timeout.                                                                                                     | Add 120-second timeouts without changing test bodies.                                          |
| Model tests need CRLF lockfile coverage               | Valid; only an LF fixture exists.                                                                                                                       | Add LF/CRLF cases with the same importer resolutions and assertion.                            |

## Validation

- [x] Focused MCPB model and staged-runtime tests pass; the Linux-only process-spawning tests are skipped on Windows, and no pack integration test is runnable on this host.
- [x] Formatting, lint, typecheck, coverage, build, asset validation, and audit pass.
- [x] Only still-valid findings are represented in the final diff.
