# PR #37 Review Addressal Tracker

Source review plan: [issue comment 5134325563](https://github.com/krishna916/relay/pull/37#issuecomment-5134325563)

Branch: `feature/issue-36-linux-mcpb`

## Ordered tasks

- [ ] Task 1 — Restore the repository verification gate: format the issue #36 plan, run `format:check` and `verify`, and update PR evidence.
- [ ] Task 2 — Gate the staged Linux integration test behind Linux plus `RELAY_RUN_MCPB_STAGE_TESTS=1`; order dedicated CI staging and verification steps.
- [ ] Task 3 — Capture real staged stderr and add the raw startup-failure stdout/stderr probe.
- [ ] Task 4 — Run the complete Windows-safe verification set and confirm the Windows guard leaves no generated output.
- [ ] Task 5 — Push remediation commits and inspect the Ubuntu CI sequence step-by-step.
- [ ] Task 6 — Record verified CI evidence, update the PR description, and post the final addressal report.

## Evidence log

| Task | Status  | Evidence |
| ---- | ------- | -------- |
| 1    | Pending |          |
| 2    | Pending |          |
| 3    | Pending |          |
| 4    | Pending |          |
| 5    | Pending |          |
| 6    | Pending |          |

## Fixed constraints

- Keep `Refs #36`; do not close issue #36 from the PR.
- Keep the Linux/Claude Desktop evidence boundary honest: Ubuntu CI does not prove maintainer Claude Desktop compatibility.
- Do not resolve review threads until corresponding commits are pushed and replacement CI evidence exists.
- Do not commit generated MCPB artifacts, staging directories, databases, logs, maps, coverage, or native dependency output.
