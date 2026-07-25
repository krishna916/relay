# HTTP Task API Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Expose every basic task workflow through a loopback-only HTTP API backed exclusively by `TaskApplication`.

**Architecture:** Split the current monolithic HTTP handler into routing, JSON/error, validation, DTO, task-route, and runtime-composition modules. The server receives a required `TaskApplication`; production startup composes it with the migrated SQLite repository, while integration tests inject a deterministic application over a fresh database.

**Tech Stack:** Node `http`, TypeScript, Zod 4, better-sqlite3, Vitest.

## Global Constraints

- Bind only to `127.0.0.1` or `localhost`; preserve `/api/health`, static-file serving, HEAD behavior, and traversal protection.
- HTTP modules call only `TaskApplication`; they never import SQLite repositories or domain lifecycle functions.
- Use explicit lifecycle routes only; never expose a generic `status` patch.
- JSON responses use `application/json; charset=utf-8`; timestamps remain ISO-8601 strings.
- JSON request bodies are limited to 64 KiB and require `application/json` (a charset parameter is allowed).
- Invalid requests map to `INVALID_REQUEST`/400, missing tasks to `TASK_NOT_FOUND`/404, transitions to their domain codes/409, wrong methods to 405, large bodies to 413, media type to 415, and unanticipated failures to `INTERNAL_ERROR`/500 without internals.
- New behavior follows red-green-refactor and is verified through the actual server on port `0` with isolated SQLite databases.

---

### Task 1: HTTP contracts and server extraction

**Files:**

- Create: `src/interfaces/http/http-json.ts`
- Create: `src/interfaces/http/http-errors.ts`
- Create: `src/interfaces/http/http-router.ts`
- Modify: `src/interfaces/http/create-http-server.ts`
- Modify: `tests/integration/http-health.test.ts`
- Modify: `tests/unit/interfaces/http/create-http-server.test.ts`

**Consumes:** `TaskApplication` injection and existing health/static helpers.

**Produces:** an async request dispatcher with JSON writer/error response helpers and an `HttpServerOptions` contract requiring `taskApplication`.

- [ ] **Step 1: Write failing server tests proving injected applications are required, health remains available, static GET/HEAD remain available, unknown `/api/*` returns structured JSON 404, and known paths reject unsupported methods with `Allow`.**
- [ ] **Step 2: Run `pnpm test -- tests/integration/http-health.test.ts tests/unit/interfaces/http/create-http-server.test.ts`; confirm failures identify the absent application injection or structured errors.**
- [ ] **Step 3: Extract the request handler into `routeHttpRequest`, centralize `sendJson`/`sendError`, route health before task routes, route unknown API paths before static assets, and catch all async handler rejections.**
- [ ] **Step 4: Re-run the focused tests and confirm the extracted server preserves the health/static contracts.**

### Task 2: DTOs, strict schemas, and request reader

**Files:**

- Create: `src/interfaces/http/task-dto.ts`
- Create: `src/interfaces/http/task-schemas.ts`
- Modify: `src/interfaces/http/http-json.ts`
- Create: `tests/integration/http-tasks.test.ts`

**Consumes:** domain task/status/priority types and Zod 4.

**Produces:** `toTaskDto(task)`, strict create/edit schemas, decoded task-ID parsing, list-query parser, and body parsing that returns `unknown`.

- [ ] **Step 1: Add failing HTTP tests for a complete camel-case DTO, empty/unknown/immutable edit bodies, invalid ID encoding, invalid views, duplicate query parameters, default limits, invalid numeric limits, missing/incorrect content type, empty/malformed JSON, and 64 KiB overflow.**
- [ ] **Step 2: Run `pnpm test -- tests/integration/http-tasks.test.ts`; confirm it fails because task routes/helpers are absent.**
- [ ] **Step 3: Implement `readJsonBody` with its 64 KiB cap, strict `z.object` schemas matching the shared field limits, field-oriented Zod details, decoded ID validation, and `view` mappings (`inbox`, `active`, `backlog`, `completed`) with defaults of 100/50.**
- [ ] **Step 4: Re-run the task integration test and confirm invalid inputs produce the specified safe error bodies.**

### Task 3: Create, get, and list endpoints

**Files:**

- Create: `src/interfaces/http/task-routes.ts`
- Modify: `src/interfaces/http/http-router.ts`
- Modify: `tests/integration/http-tasks.test.ts`

**Consumes:** `TaskApplication`, HTTP helpers, DTO mapping, and validation helpers.

**Produces:** `POST /api/tasks`, `GET /api/tasks/:id`, and `GET /api/tasks?view&limit` that each parse, make one application call, and map the returned task(s).

- [ ] **Step 1: Add failing integration tests for minimal and full creation (including HUMAN provenance and `Location`), retrieval, unknown IDs, default active lists, all four views, completed default limit, and limit boundaries.**
- [ ] **Step 2: Run the focused task test and confirm the endpoints return 404 or are unavailable.**
- [ ] **Step 3: Implement the three explicit route handlers: create passes fixed `{ type: 'HUMAN', name: null }`, get calls `application.get({ id })`, list calls `application.list({ statuses, limit })`, and every result maps through `toTaskDto`.**
- [ ] **Step 4: Re-run the focused tests and confirm 201/200 responses, locations, and list mappings.**

### Task 4: Edit and lifecycle endpoints

**Files:**

- Modify: `src/interfaces/http/task-routes.ts`
- Modify: `tests/integration/http-tasks.test.ts`

**Consumes:** explicit `TaskApplication.edit`, `moveToInbox`, `activate`, `start`, `moveToBacklog`, `complete`, and `archive` methods.

**Produces:** `PATCH /api/tasks/:id` plus all seven action POST routes, without a generic status transition endpoint.

- [ ] **Step 1: Add failing tests for each editable field and nullable clearing, every lifecycle action, same-state actions, invalid transitions, archived edit rejection, non-empty action bodies, and action `Allow` headers.**
- [ ] **Step 2: Run the focused task test and confirm the edit/action routes are unavailable.**
- [ ] **Step 3: Implement the patch and action handlers using a route table that pairs an action pathname with one `TaskApplication` method; require empty action bodies and map only complete returned tasks.**
- [ ] **Step 4: Re-run the focused tests and confirm all transitions flow through application services and return 200 task envelopes.**

### Task 5: Error translation and routing hardening

**Files:**

- Modify: `src/interfaces/http/http-errors.ts`
- Modify: `src/interfaces/http/http-router.ts`
- Modify: `tests/integration/http-tasks.test.ts`

**Consumes:** application/domain error classes and the shared structured error response.

**Produces:** stable 400/404/409/413/415/500 error mapping, method handling, and safe request routing.

- [ ] **Step 1: Add failing integration tests for validation details, task-not-found, transition conflict, 405/Allow, unsupported media type, payload-too-large, unknown API JSON 404, and an injected unexpected application failure.**
- [ ] **Step 2: Run the focused task test and confirm errors currently leak or use incorrect contracts.**
- [ ] **Step 3: Map known errors centrally, include `details` only when populated, log unknown errors only to stderr with safe context, and return a generic `INTERNAL_ERROR` body.**
- [ ] **Step 4: Re-run the focused tests and confirm no stack, SQL text, path, or raw Zod issue reaches the response.**

### Task 6: Production runtime and shutdown lifecycle

**Files:**

- Create: `src/interfaces/http/create-task-runtime.ts`
- Modify: `src/interfaces/http/main.ts`
- Modify: `tests/integration/http-tasks.test.ts`

**Consumes:** database connection factory, migrations, `SqliteTaskRepository`, and `createTaskApplication`.

**Produces:** `createTaskRuntime(options?: { databasePath?: string })` returning one close-once runtime and startup/shutdown orchestration that stops the server before closing SQLite.

- [ ] **Step 1: Add a failing test that creates a runtime against a new temporary database, verifies migrations permit real HTTP task creation, and calls `close` twice without error.**
- [ ] **Step 2: Run the focused integration test and confirm the runtime factory cannot be imported.**
- [ ] **Step 3: Implement runtime composition in order—open database, migrate, repository, application—and guard `close`; update `main.ts` to close a partially created runtime on startup failure and close runtime only after `instance.stop()` on SIGINT/SIGTERM.**
- [ ] **Step 4: Re-run the focused test and confirm production composition is functional and cleanup is idempotent.**

### Task 7: Coverage configuration and full verification

**Files:**

- Modify: `vitest.config.ts`
- Modify: `tests/integration/http-health.test.ts` and `tests/integration/http-tasks.test.ts` only for coverage gaps discovered during verification.

- [ ] **Step 1: Extend coverage include globs to cover nested HTTP modules without lowering any threshold.**
- [ ] **Step 2: Run `pnpm test -- tests/integration/http-health.test.ts tests/integration/http-tasks.test.ts`.**
- [ ] **Step 3: Run `pnpm typecheck`, `pnpm lint`, and `pnpm verify`.**
- [ ] **Step 4: Audit each Issue #8 acceptance criterion and the human review checkpoint: no direct SQLite/domain lifecycle imports in route handlers, no generic status patch, loopback-only host validation, safe errors, and complete endpoint coverage.**
- [ ] **Step 5: Commit the implementation with `git add` limited to the task API files/tests/config and `git commit -m "Expose task workflows through HTTP API"`.**
