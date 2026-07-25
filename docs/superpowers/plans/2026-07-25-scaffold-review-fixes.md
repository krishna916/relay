# Scaffold Review Fixes Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Fix the issue `#1` scaffold gaps found in review without adding product scope.

**Architecture:** Introduce one shared runtime-path module, extend the HTTP adapter with minimal production static serving, make MCP stdio shutdown graceful, and harden repository validation so `pnpm verify` enforces more of the actual scaffold contract.

**Tech Stack:** TypeScript, Node.js `node:http`, `@modelcontextprotocol/sdk`, Vitest, tsx.

## Global Constraints

- Keep issue `#1` scaffold-only scope; do not add task features, agent skills, vendor configs, or auth.
- Preserve loopback-only HTTP behavior and stderr-only MCP diagnostics.
- Prefer shared helpers over duplicated path logic.
- Drive every behavior change with a failing test first.
- Keep `pnpm verify` non-mutating.

---

### Task 1: Runtime Path Resolution

**Files:**

- Create: `src/shared/runtime-paths.ts`
- Modify: `src/shared/package-metadata.ts`
- Modify: `src/database/migrate.ts`
- Add/Modify Test: `tests/unit/shared/package-metadata.test.ts`

**Interfaces:**

- Produces: `getPackageRoot(): string`, `resolveFromPackageRoot(...segments: string[]): string`

- [ ] Write a failing test proving package metadata still loads when the process working directory is outside the repo root.
- [ ] Implement the shared runtime-path helper by walking upward from the executing module location until `package.json` is found.
- [ ] Switch package metadata and default migration resolution to the new helper.
- [ ] Re-run the focused tests for package metadata and migrations.

### Task 2: HTTP Production Static Serving

**Files:**

- Modify: `src/interfaces/http/create-http-server.ts`
- Add/Modify Test: `tests/integration/http-health.test.ts`

**Interfaces:**

- Produces: `GET /` serving `dist/web/index.html` when present, safe static file serving, stable JSON `404` fallback

- [ ] Write a failing integration test that starts the HTTP server after `pnpm build:web` and expects `GET /` to return the built HTML shell.
- [ ] Implement minimal path-safe static serving from `dist/web`.
- [ ] Keep `/api/health` and `404`/`405` behavior intact.
- [ ] Re-run the focused HTTP tests.

### Task 3: MCP Shutdown and Canonical Invocation

**Files:**

- Modify: `src/interfaces/mcp/main.ts`
- Add/Modify Test: `tests/integration/mcp-stdio.test.ts`

**Interfaces:**

- Produces: idempotent graceful stdio shutdown and proof that `relay-mcp` works from another working directory

- [ ] Write a failing integration test that spawns the canonical built command from outside the repo root.
- [ ] Update the MCP entry point to close the stdio transport before exiting on `SIGINT`/`SIGTERM`.
- [ ] Re-run the focused MCP integration test.

### Task 4: Repository Asset Validation

**Files:**

- Modify: `scripts/validate-repository-assets.ts`
- Add Test: `tests/unit/scripts/validate-repository-assets.test.ts`
- Modify: `README.md` only if needed to satisfy link validation

**Interfaces:**

- Produces: stricter validation for required files, parsed JSON, README local links, placeholder markers, and forbidden scope-creep assets

- [ ] Write failing validator tests for broken local links and placeholder markers.
- [ ] Refactor the validator into testable functions and expand the checks.
- [ ] Re-run focused validator tests.

### Task 5: Verification

**Files:**

- Modify: `docs/superpowers/specs/2026-07-25-scaffold-review-fixes-design.md`
- Modify: `docs/superpowers/plans/2026-07-25-scaffold-review-fixes.md`

- [ ] Run the targeted tests touched by the fixes.
- [ ] Run `pnpm.cmd verify` for fresh end-to-end evidence.
- [ ] If audit is blocked by sandbox networking again, report that limitation explicitly with the passing local gates before audit.
