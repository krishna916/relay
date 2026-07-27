# Issue #22 CLI Task Adapter Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Ship the source-checkout `relay` CLI task/session adapter with the same versioned results and mutation semantics as MCP.

**Architecture:** `runCli(argv, dependencies)` will strictly parse an agent-facing task/session command before constructing the shared `TaskRuntime`. Command handlers call `TaskApplication` directly and build the #19 JSON envelope through shared CLI output/error mappers; `main.ts` only adapts Node process streams and exit codes. The adapter reuses task DTO and mutation-change mappers, never HTTP, MCP, or SQLite APIs.

**Tech Stack:** TypeScript, Node.js 24, Vitest, Zod contract schemas, tsup, pnpm.

## Global Constraints

- JSON mode writes exactly one schema-versioned JSON document plus a newline to stdout; diagnostics go only to stderr.
- Exit codes are stable: `0` success, `1` internal, `2` usage/validation, `3` not found, `4` conflict/archived, `5` storage.
- Create a shared runtime only after parsing succeeds and close it exactly once on every execution path.
- Invoke `TaskApplication` directly; do not call HTTP, spawn MCP, access SQLite directly, or create CLI-specific mutation behavior.
- Support exactly the ten commands and only documented options; reject unknown commands, options, duplicate singular options, and missing values.
- `RELAY_DB_PATH` supplies isolated storage through the shared runtime, independent of the process CWD.

---

### Task 1: Strict command parser and envelope/runtime boundary

**Files:**
- Create: `src/interfaces/cli/parse-cli.ts`, `src/interfaces/cli/run-cli.ts`, `src/interfaces/cli/output/cli-result.ts`, `src/interfaces/cli/output/cli-errors.ts`, `tests/unit/interfaces/cli/run-cli.test.ts`
- Modify: `src/interfaces/contracts/task-contract.ts` only if an existing schema needs re-exporting for CLI validation.

**Interfaces:**
- Consumes: `TaskApplication`, `TaskRuntime`, `CONTRACT_SCHEMA_VERSION`, the task contract schemas, and MCP's `toTaskMcpDto`, `editChange`, `triageChange`, `lifecycleChange`.
- Produces: `runCli(argv, { createRuntime, stdout, stderr }): Promise<number>` and parsed command union with command-specific validated input.

- [ ] **Step 1: Write failing parser/output/lifecycle tests.**

```ts
await expect(runCli(['task', 'get', 'id', '--output', 'json'], deps)).resolves.toBe(0);
expect(stdout).toBe(`${JSON.stringify({ schemaVersion: 1, ok: true, data: { task }, warnings: [] })}\n`);
expect(createRuntime).toHaveBeenCalledTimes(1);
expect(runtime.close).toHaveBeenCalledTimes(1);
await expect(runCli(['task', 'get'], deps)).resolves.toBe(2);
expect(createRuntime).not.toHaveBeenCalled();
```

- [ ] **Step 2: Run the focused test and confirm it fails because the CLI module does not exist.**

Run: `pnpm test -- tests/unit/interfaces/cli/run-cli.test.ts`

- [ ] **Step 3: Implement strict parser, success/error envelopes, error-to-exit mapping, and one-close runtime execution wrapper.**

```ts
type CliEnvelope = { schemaVersion: number; ok: boolean; data?: Record<string, unknown>; warnings?: readonly unknown[]; error?: { code: string; message: string } };
export async function runCli(argv: readonly string[], dependencies: CliDependencies): Promise<number> {
  const command = parseCli(argv);
  const runtime = dependencies.createRuntime();
  try { return execute(command, runtime.taskApplication, dependencies); }
  catch (error) { return writeCliError(error, dependencies.stderr, dependencies.stdout); }
  finally { runtime.close(); }
}
```

- [ ] **Step 4: Re-run focused tests and confirm valid JSON has no stderr and every parser failure avoids runtime startup.**

Run: `pnpm test -- tests/unit/interfaces/cli/run-cli.test.ts`

### Task 2: Read and capture command handlers

**Files:**
- Create: `src/interfaces/cli/commands/task-capture.ts`, `src/interfaces/cli/commands/task-list.ts`, `src/interfaces/cli/commands/task-get.ts`, `src/interfaces/cli/commands/task-find-similar.ts`, `src/interfaces/cli/commands/session-captures.ts`
- Modify: `src/interfaces/cli/run-cli.ts`, `tests/unit/interfaces/cli/run-cli.test.ts`

**Interfaces:**
- Consumes: parsed commands, `TaskApplication.create/list/get/findSimilar/listSessionCaptures`, `toTaskMcpDto`, and `matchReason`.
- Produces: `{ task, change: { action: 'CREATED' } }`, `{ tasks, count }`, `{ candidates }`, and `{ sessionId, tasks, count }` payloads identical to MCP equivalents.

- [ ] **Step 1: Add failing tests for every read/capture command, strict limits/statuses, and advisory duplicate warnings.**

```ts
await runCli(['task', 'capture', '--title', 'Release', '--agent', 'codex', '--session', 'session-1', '--output', 'json'], deps);
expect(application.findSimilar).toHaveBeenCalledWith({ title: 'Release', limit: 5 });
expect(application.create).toHaveBeenCalledWith(expect.objectContaining({ sessionId: 'session-1', creator: { type: 'AGENT', name: 'codex' } }));
expect(json(stdout).warnings).toEqual([{ code: 'POSSIBLE_DUPLICATE', message: 'Similar tasks already exist.', candidates: [{ id: 'existing' }] }]);
```

- [ ] **Step 2: Run focused tests and confirm they fail for the unimplemented dispatch paths.**

Run: `pnpm test -- tests/unit/interfaces/cli/run-cli.test.ts`

- [ ] **Step 3: Implement handlers that call the corresponding application method exactly once and serialize MCP-parity payloads.**

```ts
const candidates = application.findSimilar({ title: command.title, ...(command.workspace === undefined ? {} : { workspace: command.workspace }), limit: command.limit });
return success({ candidates: candidates.map((task) => ({ task: toTaskMcpDto(task), matchReason: matchReason(task, command.title) })) });
```

- [ ] **Step 4: Re-run focused tests.**

Run: `pnpm test -- tests/unit/interfaces/cli/run-cli.test.ts`

### Task 3: Mutation command handlers

**Files:**
- Create: `src/interfaces/cli/commands/task-edit.ts`, `src/interfaces/cli/commands/task-triage.ts`, `src/interfaces/cli/commands/task-start.ts`, `src/interfaces/cli/commands/task-complete.ts`, `src/interfaces/cli/commands/task-archive.ts`
- Modify: `src/interfaces/cli/run-cli.ts`, `tests/unit/interfaces/cli/run-cli.test.ts`

**Interfaces:**
- Consumes: `TaskApplication.edit/moveToInbox/activate/moveToBacklog/start/complete/archive` and MCP change-metadata mappers.
- Produces: mutation payload `{ task, change }` with exactly the #21 `EDITED`, `TRIAGED`, lifecycle, and `NO_CHANGE` shapes.

- [ ] **Step 1: Add failing tests for edit field/clear conflicts, no-op metadata, three permitted triage targets, and lifecycle errors.**

```ts
await runCli(['task', 'edit', 'id', '--clear-description', '--output', 'json'], deps);
expect(application.edit).toHaveBeenCalledWith({ id: 'id', description: null });
await expect(runCli(['task', 'triage', 'id', '--to', 'DONE', '--output', 'json'], deps)).resolves.toBe(2);
expect(json(stdout).error.code).toBe('VALIDATION_ERROR');
```

- [ ] **Step 2: Run focused tests and confirm mutation dispatch is not yet available.**

Run: `pnpm test -- tests/unit/interfaces/cli/run-cli.test.ts`

- [ ] **Step 3: Implement narrow mutation handlers and reuse existing metadata mappers without generic status mutation.**

```ts
const mutation = command.target === 'INBOX' ? application.moveToInbox({ id: command.id }) : command.target === 'ACTIVE' ? application.activate({ id: command.id }) : application.moveToBacklog({ id: command.id });
return success({ task: toTaskMcpDto(mutation.task), change: triageChange(mutation.before, mutation.task) });
```

- [ ] **Step 4: Re-run focused tests and verify all stable exit categories.**

Run: `pnpm test -- tests/unit/interfaces/cli/run-cli.test.ts`

### Task 4: Executable packaging, process integration, parity, and documentation

**Files:**
- Create: `src/interfaces/cli/main.ts`, `tests/integration/cli.test.ts`, `tests/integration/mcp-cli-parity.test.ts`
- Modify: `package.json`, `tsup.config.ts`, `tests/unit/scripts/validate-repository-assets.test.ts`, `scripts/validate-repository-assets.ts`, `docs/cli-reference.md`, `README.md`

**Interfaces:**
- Consumes: `runCli`, `createTaskRuntime`, Node process argv/stdout/stderr, built `dist/cli/main.js`, and existing MCP fixture envelopes.
- Produces: a `relay` bin entry and built CLI executable that operates from an arbitrary CWD with `RELAY_DB_PATH`.

- [ ] **Step 1: Add failing built-process and MCP/CLI parity tests.**

```ts
const result = spawnSync(process.execPath, [builtCliPath, 'task', 'list', '--output', 'json'], { cwd: launchDir, env: { ...process.env, RELAY_DB_PATH: databasePath } });
expect(result.status).toBe(0);
expect(JSON.parse(result.stdout.toString())).toMatchObject({ schemaVersion: 1, ok: true });
expect(result.stderr.toString()).toBe('');
```

- [ ] **Step 2: Run integration tests and confirm they fail because the CLI entry/build asset is absent.**

Run: `pnpm test -- tests/integration/cli.test.ts tests/integration/mcp-cli-parity.test.ts`

- [ ] **Step 3: Add `main.ts`, the `relay` bin/build entries, asset validation, CLI reference, and README invocation guidance.**

```ts
void runCli(process.argv.slice(2), { createRuntime: createTaskRuntime, stdout: process.stdout, stderr: process.stderr })
  .then((exitCode) => { process.exitCode = exitCode; });
```

- [ ] **Step 4: Run the focused unit/integration suite, then the full issue verification gate.**

Run: `pnpm test -- tests/unit/interfaces/cli tests/integration/cli.test.ts tests/integration/mcp-cli-parity.test.ts`

Run: `pnpm verify`

## Plan self-review

- Coverage: Tasks 1–3 implement the specified parser, envelopes, lifecycle, all ten commands, direct application invocation, validation, exit codes, and change metadata. Task 4 covers source-checkout build/bin, arbitrary-CWD/isolated database operation, MCP parity, assets, docs, and full verification.
- No placeholders: all command families, interfaces, expected tests, and verification commands are explicit.
- Consistency: every handler uses `TaskApplication`; task DTO and mutation metadata remain the existing MCP-compatible names.
