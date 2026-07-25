# Issue #10 Basic Workflow Verification Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Prove the existing local task workflow persists across a runtime restart and document accurate setup, operation, recovery, and manual verification instructions without adding product capabilities.

**Architecture:** Extend the existing HTTP integration test so two independently created `TaskRuntime` instances use the same temporary SQLite path, with HTTP requests exercising the real server, application service, migrations, and repository. Replace scaffold documentation with the current MVP contracts and add a human-executable checklist that isolates all manual work in a disposable database.

**Tech Stack:** Node.js 24, TypeScript, Vitest, native `fetch`, better-sqlite3, React/Vite, pnpm.

## Global Constraints

- Use only temporary explicit database paths in tests and manual verification; never resolve, read, modify, or delete the default Relay database.
- Preserve the `pnpm verify` quality gate, its 80% coverage thresholds, and its non-mutating behavior for tracked source files.
- Do not introduce task-manager features, MCP production task behavior, browser E2E tooling, release tooling, or broad refactors.
- Keep HTTP bound to loopback and document only the API/UI behavior already implemented.
- Stop runtimes and remove temporary SQLite directories, including WAL and SHM sidecars, in `finally`/test cleanup.

---

## File Structure

- Modify: `tests/integration/http-tasks.test.ts` — one real-stack workflow/restart persistence test using the existing temporary-database helper.
- Modify: `README.md` — accurate MVP setup, runtime, database, workflow, architecture, limitations, and troubleshooting documentation.
- Create: `docs/manual-verification/basic-todo-workflow.md` — manual disposable-database procedure with expected results for every issue-required step.

### Task 1: Add Real-Stack Restart-Persistence Coverage

**Files:**

- Modify: `tests/integration/http-tasks.test.ts`

**Interfaces:**

- Consumes: `createTaskRuntime({ databasePath })`, `createHttpServer({ host: '127.0.0.1', port: 0, taskApplication })`, and `createTemporaryDatabase()`.
- Produces: regression coverage proving a task created, edited, transitioned, completed, and read through HTTP remains persisted after closing the first runtime and starting a second runtime at the same temporary database path.

- [ ] **Step 1: Write the failing restart-persistence test**

Add a test that creates an empty temporary database directory, closes the helper's initial connection, then starts runtime/server A. Through HTTP, create a task, patch all editable metadata, activate it, start it, and complete it. Save the returned ID and `startedAt`, close server/runtime A, then start runtime/server B using the same `databasePath`. Assert HTTP `GET /api/tasks/:id` returns the edited `DONE` task with the original `startedAt` and a non-null `completedAt`; assert `GET /api/tasks?view=completed` includes it; archive it through HTTP and verify the completed view no longer includes its ID.

- [ ] **Step 2: Run the focused test to verify it fails before implementation**

Run: `pnpm test -- tests/integration/http-tasks.test.ts`

Expected: the new test initially fails because the restart-persistence behavior has not yet been added to the test suite.

- [ ] **Step 3: Add the smallest test-only lifecycle helpers needed for safe runtime replacement**

Use local `runtime` and `server` variables inside the test with a `try/finally`. Stop each running server before closing its runtime, set references to `null` after close, and call the temporary database cleanup in `finally`. Reuse the existing HTTP helper functions where their response contracts apply; do not alter application or production code.

- [ ] **Step 4: Run the focused test to verify it passes**

Run: `pnpm test -- tests/integration/http-tasks.test.ts`

Expected: all HTTP integration tests pass, including the new persistence scenario.

- [ ] **Step 5: Run the full test suite with coverage**

Run: `pnpm test:coverage`

Expected: all tests pass and statements, branches, functions, and lines each remain at or above 80%.

### Task 2: Replace Scaffold README with Accurate MVP Documentation

**Files:**

- Modify: `README.md`

**Interfaces:**

- Consumes: `package.json` scripts, `src/database/database-config.ts`, `src/database/connection.ts`, `src/interfaces/http/create-http-server.ts`, shared workflow contracts, and existing React UI behavior.
- Produces: standalone user/developer documentation whose commands and behavior match the shipped local task slice.

- [ ] **Step 1: Write the required README content before changing the document**

Draft sections for product summary; prerequisites/setup; verification; running UI/API; database paths and `RELAY_DB_PATH`; lifecycle/views/editable fields; architecture boundaries; limitations; and troubleshooting. Include exact Node `24.x`, pnpm `10.2.0`, `corepack enable`, `nvm use`, `pnpm install --frozen-lockfile`, `pnpm verify`, `pnpm dev:ui`, loopback HTTP `127.0.0.1:43110`, Vite `5173`, and no-background-daemon behavior.

- [ ] **Step 2: Replace outdated scaffold claims with the documented MVP behavior**

Document the four views (Inbox, Active, Backlog, Completed), lifecycle `INBOX -> ACTIVE -> IN_PROGRESS -> DONE` with the Active-to-Backlog branch, valid return paths, idempotent same-state actions, completed-task editing, no reopen action, retained-but-hidden archives, no archive browser/restore UI, and the bounded recent Completed list. State that React calls the loopback HTTP adapter, adapters call application services, SQLite uses explicit SQL/no ORM, and MCP production task tools remain future work under issue #2.

- [ ] **Step 3: Document safety and recovery accurately**

Provide Windows, macOS, and Linux default database paths; automatic migrations; WAL, foreign keys, and 5-second busy timeout; a PowerShell disposable-database example that creates a unique temp directory and sets `RELAY_DB_PATH`; and a warning that deleting a database permanently deletes tasks. Include troubleshooting for ports, invalid/unwritable paths, migration checksum mismatches, native SQLite setup, Node-version mismatch, and UI service retry.

- [ ] **Step 4: Verify documented commands and formatting**

Run: `pnpm format:check && pnpm lint && pnpm typecheck`

Expected: documentation and unchanged source satisfy formatting, linting, and type checking.

### Task 3: Add Manual Verification Guide with Expected Results

**Files:**

- Create: `docs/manual-verification/basic-todo-workflow.md`

**Interfaces:**

- Consumes: README startup/configuration instructions and the shared task/HTTP contracts.
- Produces: an ordered, expected-result checklist for a clean disposable-database workflow that a reviewer can execute without issue history.

- [ ] **Step 1: Add disposable setup and startup verification**

Write the PowerShell temporary-directory commands, state that the default database must not be touched, and record expected loopback service/UI loading plus automatic migration evidence (`_relay_migrations` contains migrations `0001` and `0002`; `tasks` exists).

- [ ] **Step 2: Add the complete task workflow checklist**

Record expected outcomes for minimal and metadata task creation, displayed read-only fields, editing and clearing nullable fields across refresh, all specified lifecycle paths, first-start timestamp preservation, completed-task editing/no reopen, two-step open and completed archive behavior, hidden retained archives/no browser or restore, blank-title/over-limit feedback, and invalid-transition 409 recovery.

- [ ] **Step 3: Add restart, cleanup, and evidence sections**

Require clean shutdown, restart with the exact same disposable path, persisted non-archived tasks in their correct views, archived rows retained but hidden, and removal of the disposable directory only after processes stop. Include a results table capturing commands, fresh-path strategy without personal paths, completed checklist steps, restart result, skipped steps, and confirmation that no default personal database was touched.

- [ ] **Step 4: Verify documentation formatting**

Run: `pnpm format:check`

Expected: Prettier accepts the new Markdown files without writing them.

### Task 4: Clean-Environment and Final Verification

**Files:**

- Verify: `package.json`, `README.md`, `docs/manual-verification/basic-todo-workflow.md`, `tests/integration/http-tasks.test.ts`

**Interfaces:**

- Consumes: frozen lockfile, Node 24 runtime, pnpm scripts, and a temporary `RELAY_DB_PATH`.
- Produces: evidence that the required quality gate and fresh-database workflow work without changing tracked files beyond intentional issue #10 edits.

- [ ] **Step 1: Run clean-install validation where the existing checkout permits**

Run: `corepack enable`, `nvm use`, and `pnpm install --frozen-lockfile`.

Expected: the pinned Node 24 and pnpm 10.2.0 environment installs exactly from the lockfile.

- [ ] **Step 2: Run the full authoritative gate**

Run: `pnpm verify`

Expected: formatting, lint, type checking, coverage, build, asset validation, and high-severity audit all pass.

- [ ] **Step 3: Confirm verification did not rewrite tracked files**

Run: `git status --short`

Expected: only the intentional issue #10 test and documentation files are changed.

- [ ] **Step 4: Perform the disposable-database manual UI/API workflow where locally possible**

Start `pnpm dev:ui` with a newly created temporary `RELAY_DB_PATH`, exercise the manual guide, shut down cleanly, restart with the same path, and remove only that temporary directory afterward.

Expected: fresh migrations, loopback UI/API availability, persistence across restart, and hidden archives match the manual guide; record any unperformed UI-only steps honestly.

- [ ] **Step 5: Commit the verified implementation**

Run:

```bash
git add README.md docs/manual-verification/basic-todo-workflow.md docs/superpowers/plans/2026-07-26-issue-10-basic-workflow-verification.md tests/integration/http-tasks.test.ts
git commit -m "Verify and document local task workflow"
```

Expected: one focused commit containing only issue #10 verification and documentation work.
