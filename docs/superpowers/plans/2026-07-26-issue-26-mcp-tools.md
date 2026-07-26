# Issue 26 MCP Tools Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Expose the approved task application through five safe, versioned MCP stdio tools.

**Architecture:** `main.ts` composes one shared `TaskRuntime`, injects its `TaskApplication` into `createMcpServer`, and owns idempotent cleanup. Focused MCP modules validate #19 contracts, invoke application operations only, and map tasks/results/errors to structured MCP responses; they never access SQLite.

**Tech Stack:** TypeScript, Zod 4, MCP SDK 1.29, Vitest, SQLite runtime.

## Global Constraints

- Preserve `relay_health` and protocol-clean stdout.
- Success payloads are `{ schemaVersion: 1, data, warnings }`; structured content is authoritative.
- Strictly reject unknown input keys and caller-controlled task status/provenance.
- Error codes are `VALIDATION_ERROR`, `NOT_FOUND`, `STORAGE_ERROR`, and `INTERNAL_ERROR`; never leak causes, SQL, paths, or stacks.
- `task_capture` always creates after advisory duplicate lookup and forces `creator.type: 'AGENT'`.
- No direct persistence access in MCP modules and no unrelated mutation tools.

---

### Task 1: Complete the approved list-query contract

**Files:** Modify `src/application/tasks/{task-application.ts,use-cases/list-tasks.ts,task-repository.ts}`, `src/database/tasks/sqlite-task-repository.ts`; test `tests/{unit/application/tasks/task-application.test.ts,integration/task-repository.test.ts}`.

- [ ] Write failing tests that pass `workspace` with a list request and prove an exact workspace filter is applied in the repository before `limit`.
- [ ] Run the focused tests and confirm they fail because the application query lacks `workspace`.
- [ ] Extend `ListTasksInput`/`TaskListQuery` with optional normalized workspace; validate it in the application and add SQL `workspace = ?` before ordering/limit.
- [ ] Re-run focused unit and repository integration tests; commit the narrowly scoped #19 contract correction.

### Task 2: Establish MCP schemas and stable mappers

**Files:** Create `src/interfaces/mcp/{schemas/read-tool-schemas.ts,mapping/task-mcp-dto.ts,mapping/mcp-result.ts,mapping/mcp-errors.ts}`; modify MCP unit tests.

- [ ] Write failing in-memory server tests for strict schemas, `schemaVersion: 1`, structured data, and mapped validation/not-found/storage/internal errors without implementation text.
- [ ] Run the test and confirm failures reflect absent task-tool registration/mapping.
- [ ] Re-export/compose only #19 schemas, map domain tasks to contract DTOs, emit compact JSON text plus `structuredContent`, and map known error classes to safe error envelopes.
- [ ] Re-run MCP unit tests and commit.

### Task 3: Register the four read-only handlers

**Files:** Create `src/interfaces/mcp/tools/{register-read-tools.ts,task-list.ts,task-get.ts,task-find-similar.ts,session-captures-list.ts}`; modify `create-mcp-server.ts`; test `tests/unit/interfaces/mcp/create-mcp-server.test.ts`.

- [ ] Add failing in-memory tests covering discovery plus list/get/find/session success, invalid session/unknown keys, not-found, persisted order, isolation, and result bounds.
- [ ] Run the focused test and verify the new tools are unavailable.
- [ ] Register handlers that parse input, call the injected `TaskApplication`, and convert results only through Task 2 mapping helpers.
- [ ] Re-run focused tests, then commit.

### Task 4: Add autonomous capture last

**Files:** Create `src/interfaces/mcp/tools/task-capture.ts`; modify `register-read-tools.ts` or a focused registration module; test MCP unit tests.

- [ ] Add failing tests showing capture calls `findSimilar` before `create`, rejects `status`/creator type, forces AGENT provenance, preserves session metadata, and returns advisory duplicate candidates without blocking creation.
- [ ] Run the focused test and verify the capture tool is unavailable.
- [ ] Implement strict capture parsing, duplicate warning construction, forced creator mapping, and `CREATED` result mapping without persistence/lifecycle logic.
- [ ] Re-run focused tests and commit.

### Task 5: Compose lifecycle, built-process proof, and documentation

**Files:** Modify `src/interfaces/mcp/main.ts`, `tests/integration/mcp-stdio.test.ts`, `README.md`, `docs/mcp-tools.md`, and asset tests only if paths change.

- [ ] Add failing tests for built-process capture followed by session retrieval using an isolated `RELAY_DB_PATH`, clean stdout, runtime cleanup exactly once on signal, and cleanup after startup/connect failure where dependency seams permit.
- [ ] Run the focused integration tests and confirm the missing runtime injection/lifecycle behavior.
- [ ] Create runtime in `main.ts`, inject it, close server/runtime exactly once on signal and construction/connect failures, and send diagnostics only to stderr; document all five tools and contract guarantees.
- [ ] Run `pnpm test -- tests/unit/interfaces/mcp`, `pnpm test -- tests/integration/mcp-stdio.test.ts`, then `pnpm verify`; commit the final implementation.

## Spec coverage review

Tasks 2-4 cover all five tool schemas, success/error envelopes, provenance, duplicate warnings, session isolation/order, and strict input handling. Task 1 is the documented #19/#20 workspace-filter correction. Task 5 covers stdio lifecycle, disposable database integration, documentation, assets, and the full quality gate. No out-of-scope mutation, persistence redesign, packaging, auth, or daemon work is included.
