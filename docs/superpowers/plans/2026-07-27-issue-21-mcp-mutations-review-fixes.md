# Issue #21 MCP Mutation Review Fixes Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Bring PR #30 in line with the detailed review follow-up at issuecomment-5087087958 while keeping the scope limited to issue #21's five intent-specific MCP mutation tools.

**Architecture:** Keep MCP adapters responsible for strict input validation, one focused application-operation invocation, and result/error mapping. The application layer remains authoritative for lifecycle legality and returns atomic before/after mutation results so metadata does not require a second read.

**Tech Stack:** TypeScript, Zod, `@modelcontextprotocol/sdk`, Vitest, pnpm, MCP stdio transport.

## Global Constraints

- Do not add CLI work, skills, vendor integrations, auth, bulk mutation, restore/reopen, permanent deletion, or persistence redesign.
- Preserve public MCP output shapes and contract schema version.
- `task_edit`, `task_triage`, `task_start`, `task_complete`, and `task_archive` remain the only mutation tools.
- Do not weaken or delete tests to make the suite pass.
- Schema-invalid requests must remain SDK-native invalid-params failures; valid requests that fail during execution must use Relay structured errors.

---

### Task 1: Complete the mutation schema test matrix

**Files:**

- Modify: `tests/unit/interfaces/mcp/create-mcp-server.test.ts`
- Add a focused schema test under `tests/unit/interfaces/mcp/` only if the server test becomes unreadable.

**Required checks:**

- [x] `task_edit` rejects `{ taskId }` without an editable field.
- [x] `task_edit` rejects unknown fields and each forbidden/immutable field: `status`, `createdByType`, `createdByName`, `sessionId`, `createdAt`, `updatedAt`, `startedAt`, `completedAt`, `archivedAt`, `confirmed`, and `requestedBy`.
- [x] `task_edit` rejects direct `null` for nullable fields where clearing requires a clear flag.
- [x] `task_edit` rejects value-plus-clear conflicts for `description`, `priority`, `workspace`, and `sourceContext`.
- [x] `task_triage` accepts only `INBOX`, `ACTIVE`, and `BACKLOG`, and rejects `IN_PROGRESS`, `DONE`, and `ARCHIVED`.
- [x] `task_start`, `task_complete`, and `task_archive` reject unknown fields.
- [x] Schema-invalid calls are verified through actual `client.callTool(...)` behavior and remain SDK-native invalid-params responses.

### Task 2: Cover every editable field, clear operation, and stable ordering

**Files:**

- Modify: `tests/unit/interfaces/mcp/create-mcp-server.test.ts`

**Required checks:**

- [x] Test successful edits for `title`, `description`, `priority`, `workspace`, and `sourceContext`.
- [x] Test successful clears for `clearDescription`, `clearPriority`, `clearWorkspace`, and `clearSourceContext`.
- [x] For each mutation, assert the complete returned task, `change.action === 'EDITED'`, and only the persisted field in `change.fields`.
- [x] Fetch the task afterward with `task_get` and compare it with the mutation result.
- [x] Change `sourceContext`, `title`, and `priority` in request order and assert stable metadata order `['title', 'priority', 'sourceContext']`.

### Task 3: Complete approved no-op coverage

**Files:**

- Modify: `tests/unit/interfaces/mcp/create-mcp-server.test.ts`
- Inspect: domain lifecycle implementation and existing lifecycle tests before deciding archive behavior.

**Required checks:**

- [x] `task_edit` setting a normalized current value returns success with `NO_CHANGE` and `fields: []`.
- [x] `task_edit` clearing an already-null field returns success with `NO_CHANGE` and `fields: []`.
- [x] `task_triage` to the task's current `INBOX`, `ACTIVE`, or `BACKLOG` status returns `NO_CHANGE` with equal `from` and `to`.
- [x] Starting an `IN_PROGRESS` task and completing a `DONE` task return successful `NO_CHANGE` results.
- [x] Verify authoritative archive behavior; preserve the current same-target archived no-op if domain tests confirm it.
- [x] Assert timestamps remain unchanged and no repository update occurs for no-ops.

### Task 4: Complete structured execution-error mapping coverage

**Files:**

- Modify: `tests/unit/interfaces/mcp/create-mcp-server.test.ts`
- Modify fixtures under `tests/unit/application/tasks/` only when a controlled repository/application double is needed.

**Required checks:**

- [x] Add a schema-valid request producing `VALIDATION_ERROR`.
- [x] Add a missing-task mutation producing `NOT_FOUND`.
- [x] Add invalid lifecycle transitions producing `CONFLICT`, including more than one intent where useful.
- [x] Add archived edit, triage, start, and complete cases producing `ARCHIVED_TASK`; test archive as either restricted or no-op according to the authoritative domain contract.
- [x] Add a repository update failure producing `STORAGE_ERROR` without leaking SQL, paths, internal messages, stack, or causes.
- [x] Add an unexpected controlled exception producing generic `INTERNAL_ERROR` without exposing the original exception message.

### Task 5: Prove each handler invokes exactly one focused application operation

**Files:**

- Modify: `tests/unit/interfaces/mcp/` focused registration/handler tests.
- Modify: `src/interfaces/mcp/tools/*.ts` only if a wiring defect is found.

**Required checks:**

- [x] Use a narrow `TaskApplication` fake/spy to prove `task_edit` calls only edit.
- [x] Prove `task_triage` maps `INBOX` to move-to-inbox, `ACTIVE` to activate, and `BACKLOG` to move-to-backlog.
- [x] Prove `task_start`, `task_complete`, and `task_archive` each call only their focused operation.
- [x] Prove handlers do not access repositories, fetch separately before mutation, call multiple lifecycle methods, or implement lifecycle legality.

### Task 6: Extract one shared MCP output-envelope schema helper

**Files:**

- Create: `src/interfaces/mcp/schemas/mcp-output-schema.ts`
- Modify: `src/interfaces/mcp/schemas/read-tool-schemas.ts`
- Modify: `src/interfaces/mcp/schemas/mutation-tool-schemas.ts`
- Update import-only tests if required.

**Required implementation:**

- [x] Add `createMcpOutputSchema<T extends z.ZodType>(data: T)` that builds the strict `{ schemaVersion, data, warnings }` envelope using the existing contract version and warning schema.
- [x] Make read/capture and mutation schemas use this one helper.
- [x] Preserve public output shapes, contract version, read/capture behavior, and inferred types.

### Task 7: Simplify the duplicated application mutation API

**Files:**

- Modify: `src/application/tasks/task-application.ts`
- Modify: `src/application/tasks/use-cases/edit-task.ts`
- Modify: `src/application/tasks/use-cases/transition-task.ts`
- Modify direct callers and affected tests only.

**Required implementation:**

- [x] Choose one canonical mutation API returning `{ before: Task; task: Task }` for edit, move-to-inbox, activate, move-to-backlog, start, complete, and archive.
- [x] Update existing callers that need only the result to use `.task` at their boundary.
- [x] Preserve atomic before/result capture without duplicate repository reads.
- [x] Keep lifecycle rules in the domain/application layer and avoid unrelated refactoring.
- [x] Add or update tests proving existing HTTP/UI behavior remains unchanged and no mutation rules are duplicated.

### Task 8: Preserve existing tools and stdio protocol cleanliness

**Files:**

- Modify: `tests/integration/mcp-stdio.test.ts`
- Modify existing MCP unit tests only as needed.

**Required checks:**

- [x] Existing tools remain discoverable and unchanged: `task_capture`, `task_list`, `task_get`, `task_find_similar`, and `session_captures_list`.
- [x] Exactly the five approved mutation tools are present.
- [x] Generic tools such as `task_update`, `task_set_status`, and unrestricted mutation variants remain absent.
- [x] Built stdio integration performs capture, edit, triage or start, complete or archive, and final readback.
- [x] Assert stdout contains only MCP protocol output and no logs, stack traces, SQL details, or debug output.

### Task 9: Update documentation and PR evidence

**Files:**

- Modify: `docs/mcp-tools.md`
- Update PR #30 description only after final verification evidence is available.

**Required checks:**

- [x] Document exact input names (`taskId`, `target`, and clear flags), editable fields, direct-null rejection, clear behavior, deterministic field order, triage restrictions, result shapes, no-ops, archived/conflict behavior, explicit-user-direction precondition, absence of fake confirmation fields, and SDK-invalid-params versus Relay execution-error behavior.
- [x] Run the full verification list and record command-by-command evidence from the final local code state; repository-wide `pnpm verify` remains blocked before later stages by unrelated pre-existing formatter failures.
- [x] Inspect `git diff --stat main...HEAD` and `git diff main...HEAD` for accidental scope expansion.
- [x] Record local test counts, stdout cleanliness, absence of generic mutation tools, and unchanged read/capture tools.
- [ ] Update PR #30's description with final evidence after the verified local changes are intentionally committed and pushed.

## Final verification evidence

- `pnpm test`: PASS — 25 files, 371 tests.
- `pnpm test:coverage`: PASS — 88.76% statements, 81.34% branches, 88.99% functions, 90.92% lines.
- `pnpm typecheck`: PASS.
- Changed-file Prettier check: PASS.
- Changed-file ESLint check: PASS.
- `pnpm build`: PASS.
- `pnpm validate:assets`: PASS.
- `pnpm verify`: BLOCKED at `pnpm format:check` by 16 unrelated pre-existing files outside this follow-up's changed set; no unrelated formatting sweep was applied.
- `pnpm audit --audit-level high`: BLOCKED by the environment's denied npm registry network request; no audit result was produced.
- Remote PR #30 CI at existing head `2732e70f315ead1a9678369e031b290d37b75d2c`: `verify` and CodeRabbit SUCCESS. Local changes are not yet represented by that remote SHA, so the PR description and re-review request remain intentionally untouched.

## Verification commands

```bash
pnpm test -- tests/unit/interfaces/mcp
pnpm test -- tests/integration/mcp-stdio.test.ts
pnpm format:check
pnpm lint
pnpm typecheck
pnpm test:coverage
pnpm build
pnpm validate:assets
pnpm verify
```

## Human review checkpoints

- [ ] Every mutation schema rejects unknown, immutable, provenance, session, and timestamp fields.
- [ ] `task_triage` cannot reach `IN_PROGRESS`, `DONE`, or `ARCHIVED`.
- [ ] No fake conversational confirmation field exists.
- [ ] Every handler calls one focused application operation.
- [ ] Before/after metadata is captured without duplicate reads.
- [ ] Approved no-ops return success with deterministic metadata and no unnecessary writes.
- [ ] Archived restrictions match the domain lifecycle contract.
- [ ] Read/capture tools and envelopes have no unintended changes.
- [ ] MCP stdout is protocol-clean.
- [ ] `pnpm verify` passes on the final commit.
