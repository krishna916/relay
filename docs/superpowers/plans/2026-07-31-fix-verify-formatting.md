# Restore Verify Formatting Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Restore the repository formatting gate so `pnpm verify` can proceed past `format:check`.

**Architecture:** Enforce LF checkout behavior at the repository boundary with `.gitattributes`, matching the locked Prettier 3.9.6 configuration. No application behavior, dependency versions, or verification scripts will change.

**Tech Stack:** pnpm 10.2.0, Prettier 3.9.6, TypeScript, Markdown.

## Global Constraints

- Preserve the existing untracked `.codegraph/` index.
- Do not modify applied migrations, runtime behavior, or package dependency declarations.
- Run the complete `pnpm.cmd verify` gate before publishing because PowerShell blocks the `pnpm.ps1` shim in this environment.

---

### Task 1: Restore committed Prettier formatting

**Files:**

- Modify: the 25 files reported by `pnpm.cmd verify` at `format:check`.

**Interfaces:**

- Consumes: repository `.prettierrc.json` and locked Prettier 3.9.6.
- Produces: a formatting-only diff that passes `format:check`.

- [ ] Run Prettier write mode against only the reported files to normalize the current checkout.
- [ ] Add `.gitattributes` with `* text=auto eol=lf` so Windows `core.autocrlf` cannot reintroduce the failure.
- [ ] Inspect `git diff --stat`, `git diff --check`, and the full diff for the config-only repair.

### Task 2: Verify and publish

**Files:**

- No additional source files.

**Interfaces:**

- Consumes: the formatting-only diff from Task 1.
- Produces: a passing full verify gate and a pushed commit on `feature/issue-36-linux-mcpb`.

- [ ] Run `pnpm.cmd verify` and confirm exit code 0.
- [ ] Commit only the reviewed formatting repair; leave `.codegraph/` untracked.
- [ ] Push the current branch with tracking and report the resulting commit and remote state.
