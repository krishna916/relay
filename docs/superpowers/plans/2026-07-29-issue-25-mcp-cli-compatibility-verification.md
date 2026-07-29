# Issue #25 MCP and CLI Compatibility Verification Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Prove that Relay's built MCP, CLI, and HTTP adapters expose one consistent task contract, preserve session and database-path boundaries, keep MCP stdout protocol-clean, and work through the documented Codex and Claude Code source-checkout integrations.

**Architecture:** Add a narrow real-stack verification harness around built `dist/mcp/main.js` and `dist/cli/main.js` processes, backed by a fresh temporary SQLite database per test. Normalize only transport envelopes, then compare authoritative external DTOs, errors, warnings, ordering, and change metadata without masking adapter divergence. Keep deterministic skill/vendor checks as repository-asset validation and record manual client evidence in one verification document.

**Tech Stack:** Node.js 24.x, pnpm 10.2.0, TypeScript 5.9, Vitest 4, official MCP TypeScript SDK, native `fetch`, better-sqlite3, React/Vite, Markdown, TOML, JSON.

## Global Constraints

- Do not begin implementation until issues #19, #20, #26, #21, #22, #23, and #24 are merged and reviewed on the working branch.
- Use built MCP and CLI entry points: `dist/mcp/main.js` and `dist/cli/main.js`.
- Every automated test must use a fresh disposable `RELAY_DB_PATH`; never resolve, inspect, modify, or delete the default user database.
- Automated tests must not invoke external LLMs or mutate real Codex, Claude Code, or other client configuration.
- Spawn built artifacts from arbitrary working directories and pass an absolute checkout path plus explicit environment.
- Capture stdout and stderr separately; MCP stdout must contain protocol frames only.
- Compare normalized external DTOs and stable contract metadata, not adapter-specific wrappers or internal persistence records.
- Preserve complete task fields including `sessionId`, schema version, warnings, duplicate match reasons, change actions/fields/from/to, stable error codes, ordering, and absence of sensitive implementation details.
- Close transports, child processes, HTTP servers, runtimes, and temporary databases in `finally` blocks even after assertion failures.
- Use fixed IDs and clocks only through dependency seams already delivered by preceding issues; do not add production-only test switches.
- Do not weaken the existing 80% coverage thresholds, asset validation, audit gate, or non-mutating `pnpm verify` behavior.
- Do not add packaging/installers, live LLM CI calls, broad browser automation, unrelated task features, cloud/remote integration, or code that conceals contract divergence.

---

## Planned File Map

### New test support

- `tests/support/agent-test-runtime.ts` — owns temporary workspace/database lifecycle, built-artifact paths, isolated environment, arbitrary-CWD helpers, and cleanup.
- `tests/support/cli-test-process.ts` — spawns the built CLI, captures stdout/stderr/exit code, parses exactly one JSON response, and exposes typed command helpers.
- `tests/support/mcp-test-client.ts` — starts the built stdio MCP server through the official SDK, calls tools, captures server stderr, and closes transport deterministically.
- `tests/support/external-contract-normalizers.ts` — unwraps transport envelopes only and returns comparable external task/result/error structures.
- `tests/fixtures/contracts/agent-workflow.ts` — fixed IDs, session IDs, workspace names, task payloads, expected ordering, and expected stable error cases shared by parity tests.

### New integration tests

- `tests/integration/mcp-cli-parity.test.ts` — capture/list/get, duplicate, mutation, no-op, validation, transition, not-found, storage-error, exit-code, and protocol-cleanliness parity.
- `tests/integration/agent-workflow-e2e.test.ts` — session isolation, all-status session review, process restart persistence, and integration-removal data preservation.
- `tests/integration/database-path-parity.test.ts` — one disposable database shared across HTTP, MCP, and CLI from different working directories.

### Asset verification and documentation

- Modify `scripts/validate-agent-integration-assets.ts` — add deterministic canonical-skill/vendor-wrapper drift rules required by issue #25.
- Modify `tests/unit/scripts/validate-agent-integration-assets.test.ts` — add positive and negative drift/removal/config-name fixtures.
- Create `docs/agent-integration-verification.md` — automated scenario matrix, manual Codex/Claude Code procedures and evidence, limitations, clean-checkout commands, and Epic #2 closure checklist.
- Modify `docs/agent-integration.md` only if manual validation finds an inaccurate documented command or limitation; do not duplicate verification evidence there.

---

### Task 1: Gate on merged contracts and add the isolated agent runtime

**Files:**

- Create: `tests/support/agent-test-runtime.ts`
- Create: `tests/fixtures/contracts/agent-workflow.ts`
- Test: `tests/unit/support/agent-test-runtime.test.ts`

**Interfaces:**

- Consumes: repository root, `dist/mcp/main.js`, `dist/cli/main.js`, `RELAY_DB_PATH`, Node child-process APIs, and the existing temporary-database cleanup conventions.
- Produces:
  - `createAgentTestRuntime(options?: AgentTestRuntimeOptions): Promise<AgentTestRuntime>`
  - `AgentTestRuntime.databasePath: string`
  - `AgentTestRuntime.checkoutPath: string`
  - `AgentTestRuntime.createWorkingDirectory(name: string): Promise<string>`
  - `AgentTestRuntime.environment(overrides?: NodeJS.ProcessEnv): NodeJS.ProcessEnv`
  - `AgentTestRuntime.close(): Promise<void>`

- [ ] **Step 1: Verify every dependency artifact exists before adding tests**

Run:

```bash
test -f docs/mcp-tools.md
test -f docs/cli-reference.md
test -f docs/session-semantics.md
test -f skills/relay-capture/SKILL.md
test -f skills/relay-session-review/SKILL.md
test -f integrations/codex/README.md
test -f integrations/claude-code/README.md
pnpm build
test -f dist/mcp/main.js
test -f dist/cli/main.js
```

Expected: every command exits `0`. If any file is absent, stop implementation and report the unmet issue dependency rather than recreating its contract inside issue #25.

- [ ] **Step 2: Write failing runtime-isolation tests**

Create `tests/unit/support/agent-test-runtime.test.ts` with focused tests that assert:

```ts
it('creates a fresh absolute database path and arbitrary working directories', async () => {
  const runtime = await createAgentTestRuntime();
  try {
    expect(path.isAbsolute(runtime.databasePath)).toBe(true);
    expect(runtime.databasePath).not.toContain(os.homedir());

    const cwd = await runtime.createWorkingDirectory('nested/client');
    expect(path.isAbsolute(cwd)).toBe(true);
    expect(cwd).not.toBe(runtime.checkoutPath);

    const env = runtime.environment({ RELAY_TEST_MARKER: 'isolated' });
    expect(env.RELAY_DB_PATH).toBe(runtime.databasePath);
    expect(env.RELAY_TEST_MARKER).toBe('isolated');
  } finally {
    await runtime.close();
  }
});

it('removes the disposable directory including SQLite sidecars', async () => {
  const runtime = await createAgentTestRuntime();
  const root = path.dirname(runtime.databasePath);
  await fs.writeFile(`${runtime.databasePath}-wal`, 'test');
  await fs.writeFile(`${runtime.databasePath}-shm`, 'test');

  await runtime.close();

  await expect(fs.stat(root)).rejects.toMatchObject({ code: 'ENOENT' });
});
```

- [ ] **Step 3: Run the focused test and confirm it fails**

Run:

```bash
pnpm vitest run tests/unit/support/agent-test-runtime.test.ts
```

Expected: FAIL because `createAgentTestRuntime` does not exist.

- [ ] **Step 4: Implement the smallest lifecycle helper**

Use this public shape:

```ts
export interface AgentTestRuntimeOptions {
  readonly environment?: NodeJS.ProcessEnv;
}

export interface AgentTestRuntime {
  readonly checkoutPath: string;
  readonly databasePath: string;
  createWorkingDirectory(name: string): Promise<string>;
  environment(overrides?: NodeJS.ProcessEnv): NodeJS.ProcessEnv;
  close(): Promise<void>;
}

export async function createAgentTestRuntime(
  options: AgentTestRuntimeOptions = {},
): Promise<AgentTestRuntime>;
```

Implementation rules:

- resolve `checkoutPath` from the test module to the repository root, not `process.cwd()`;
- create one `mkdtemp` root and database path `<root>/data/relay.db`;
- create requested working directories under `<root>/cwd/`;
- return an environment cloned from `process.env` and `options.environment`, with `RELAY_DB_PATH` forcibly set to the disposable path;
- make `close()` idempotent and recursively remove only the generated root.

Add fixed fixture exports for two sessions, two agents, one workspace, capture payloads, duplicate titles, lifecycle payloads, and malformed inputs. Use literal stable values such as `session-alpha`, `session-beta`, `codex`, `claude-code`, and `relay-verification`.

- [ ] **Step 5: Run focused tests and type checking**

Run:

```bash
pnpm vitest run tests/unit/support/agent-test-runtime.test.ts
pnpm typecheck
```

Expected: PASS with no type errors.

- [ ] **Step 6: Commit the isolated runtime**

```bash
git add tests/support/agent-test-runtime.ts tests/fixtures/contracts/agent-workflow.ts tests/unit/support/agent-test-runtime.test.ts
git commit -m "test: add isolated agent verification runtime"
```

---

### Task 2: Add built CLI and MCP process clients

**Files:**

- Create: `tests/support/cli-test-process.ts`
- Create: `tests/support/mcp-test-client.ts`
- Create: `tests/support/external-contract-normalizers.ts`
- Test: `tests/unit/support/cli-test-process.test.ts`
- Test: `tests/unit/support/mcp-test-client.test.ts`

**Interfaces:**

- Consumes: `AgentTestRuntime`, built entry points, official MCP SDK client/stdio transport, and documented CLI JSON output.
- Produces:
  - `runRelayCli(runtime, args, options?): Promise<CliProcessResult>`
  - `createMcpTestClient(runtime, options?): Promise<McpTestClient>`
  - `normalizeCliSuccess(value): ExternalOperationResult`
  - `normalizeMcpSuccess(value): ExternalOperationResult`
  - `normalizeCliError(result): ExternalError`
  - `normalizeMcpError(error): ExternalError`

- [ ] **Step 1: Write failing CLI process tests**

Cover:

```ts
it('runs the built CLI from an arbitrary cwd and parses one JSON document', async () => {
  const runtime = await createAgentTestRuntime();
  try {
    const cwd = await runtime.createWorkingDirectory('cli');
    const result = await runRelayCli(runtime, ['task', 'list', '--output', 'json'], { cwd });

    expect(result.exitCode).toBe(0);
    expect(result.stderr).toBe('');
    expect(result.json).toMatchObject({ schemaVersion: expect.any(String) });
  } finally {
    await runtime.close();
  }
});

it('retains stdout, stderr, and a stable non-zero exit code on failure', async () => {
  const runtime = await createAgentTestRuntime();
  try {
    const result = await runRelayCli(runtime, ['task', 'get', 'missing-id', '--output', 'json']);

    expect(result.exitCode).not.toBe(0);
    expect(result.json).toMatchObject({
      error: { code: expect.any(String), message: expect.any(String) },
    });
  } finally {
    await runtime.close();
  }
});
```

`CliProcessResult` must expose `exitCode`, `stdout`, `stderr`, and parsed `json`. Reject output containing zero or multiple JSON documents.

- [ ] **Step 2: Write failing MCP client tests**

Cover MCP initialization, `relay_health`, unknown-tool failure, stderr capture, and deterministic close:

```ts
it('discovers Relay tools while keeping server stdout protocol-owned', async () => {
  const runtime = await createAgentTestRuntime();
  const client = await createMcpTestClient(runtime);
  try {
    const tools = await client.listTools();
    expect(tools.map((tool) => tool.name)).toEqual(
      expect.arrayContaining([
        'relay_health',
        'task_capture',
        'task_list',
        'task_get',
        'task_find_similar',
        'session_captures_list',
      ]),
    );
    expect(client.stderr()).not.toContain('Content-Length');
  } finally {
    await client.close();
    await runtime.close();
  }
});
```

- [ ] **Step 3: Run the support tests and verify failure**

Run:

```bash
pnpm build:node
pnpm vitest run tests/unit/support/cli-test-process.test.ts tests/unit/support/mcp-test-client.test.ts
```

Expected: FAIL because the process helpers do not exist.

- [ ] **Step 4: Implement the CLI runner**

Use:

```ts
export interface CliProcessOptions {
  readonly cwd?: string;
  readonly environment?: NodeJS.ProcessEnv;
}

export interface CliProcessResult {
  readonly exitCode: number;
  readonly stdout: string;
  readonly stderr: string;
  readonly json: unknown;
}

export function runRelayCli(
  runtime: AgentTestRuntime,
  args: readonly string[],
  options?: CliProcessOptions,
): Promise<CliProcessResult>;
```

Spawn `process.execPath` with `[<absolute checkout>/dist/cli/main.js, ...args]`, `shell: false`, explicit `cwd`, and `runtime.environment(options.environment)`. Capture streams independently, wait for `close`, parse trimmed stdout once, and never infer success from JSON when the process exit code disagrees.

- [ ] **Step 5: Implement the MCP stdio client**

Use the official SDK's `Client` and `StdioClientTransport` with:

```ts
export interface McpTestClient {
  listTools(): Promise<readonly { readonly name: string }[]>;
  callTool(name: string, args: Record<string, unknown>): Promise<unknown>;
  stderr(): string;
  close(): Promise<void>;
}

export function createMcpTestClient(
  runtime: AgentTestRuntime,
  options?: { readonly cwd?: string; readonly environment?: NodeJS.ProcessEnv },
): Promise<McpTestClient>;
```

Configure command `process.execPath`, argument `<absolute checkout>/dist/mcp/main.js`, `shell: false`, explicit environment, and stderr piping. Do not manually parse MCP stdout or add logging to it.

- [ ] **Step 6: Add transport-only normalizers**

Define comparable public structures:

```ts
export interface ExternalError {
  readonly code: string;
  readonly message: string;
  readonly details?: unknown;
}

export interface ExternalOperationResult {
  readonly schemaVersion: string;
  readonly task?: unknown;
  readonly tasks?: readonly unknown[];
  readonly warnings?: readonly unknown[];
  readonly change?: unknown;
}
```

Normalizers may unwrap CLI `{ data }` or MCP content/structured-content envelopes, but must not rename task fields, sort arrays, drop warnings, coerce error codes, or hide adapter differences.

- [ ] **Step 7: Run support tests**

Run:

```bash
pnpm build:node
pnpm vitest run tests/unit/support/cli-test-process.test.ts tests/unit/support/mcp-test-client.test.ts
pnpm typecheck
```

Expected: PASS.

- [ ] **Step 8: Commit process clients**

```bash
git add tests/support/cli-test-process.ts tests/support/mcp-test-client.ts tests/support/external-contract-normalizers.ts tests/unit/support/cli-test-process.test.ts tests/unit/support/mcp-test-client.test.ts
git commit -m "test: add built MCP and CLI clients"
```

---

### Task 3: Prove capture, retrieval, session, duplicate, and restart parity

**Files:**

- Create: `tests/integration/mcp-cli-parity.test.ts`
- Create: `tests/integration/agent-workflow-e2e.test.ts`

**Interfaces:**

- Consumes: Tasks 1–2 helpers, shared issue #19 contract fixtures, documented MCP tool inputs, and CLI commands.
- Produces: automated scenarios 1–8 and 13 from the authoritative issue specification.

- [ ] **Step 1: Add MCP-to-CLI and CLI-to-MCP red tests**

In `mcp-cli-parity.test.ts`, add independent tests that:

1. call MCP `task_capture`, then CLI `task get <id> --output json`;
2. call CLI `task capture ... --output json`, then MCP `task_get`;
3. seed several tasks with fixed timestamps/IDs through supported seams and compare MCP/CLI list and get DTOs field-for-field, including `sessionId` and ordering.

Use normalizers only to unwrap envelopes:

```ts
expect(normalizeCliSuccess(cli.json)).toEqual(normalizeMcpSuccess(mcpResult));
```

- [ ] **Step 2: Add session-isolation and all-status red tests**

In `agent-workflow-e2e.test.ts`:

- capture tasks into `session-alpha` and `session-beta`;
- complete one alpha task and archive another;
- call `session_captures_list` for alpha;
- assert alpha includes its open, completed, and archived captures and excludes beta;
- assert missing and malformed session IDs return the exact documented stable errors through both adapters.

- [ ] **Step 3: Add duplicate parity red tests**

Create one existing open task, then submit an overlapping capture through both adapters in fresh databases. Compare:

- duplicate candidate task DTOs;
- warning code and text fields defined by #19;
- match reasons;
- whether creation proceeds or is rejected according to the authoritative contract;
- deterministic candidate ordering.

Do not add fuzzy matching or modify duplicate logic in this issue.

- [ ] **Step 4: Add explicit mutation parity red tests**

For fresh tasks, execute edit, triage, start, complete, and archive through CLI and MCP in mirrored databases. After every operation compare the complete resulting task plus change metadata. Include nullable field clearing if exposed by #19.

- [ ] **Step 5: Add process-restart persistence red tests**

Capture via a short-lived MCP process, close it, read via a new CLI process, mutate via another CLI process, then read via a new MCP process. Assert the same task ID and timestamps survive. Repeat once with the capture direction reversed.

- [ ] **Step 6: Run focused tests and inspect genuine divergence**

Run:

```bash
pnpm build:node
pnpm vitest run tests/integration/mcp-cli-parity.test.ts tests/integration/agent-workflow-e2e.test.ts
```

Expected: tests either pass against merged dependencies or fail at a specific contract divergence. Fix production code only when the issue belongs to a merged dependency contract; do not weaken normalizers or assertions.

- [ ] **Step 7: Commit parity coverage**

```bash
git add tests/integration/mcp-cli-parity.test.ts tests/integration/agent-workflow-e2e.test.ts
git commit -m "test: verify MCP and CLI workflow parity"
```

---

### Task 4: Prove no-op, error, exit-code, storage, and protocol parity

**Files:**

- Modify: `tests/integration/mcp-cli-parity.test.ts`
- Modify: `tests/support/mcp-test-client.ts`
- Modify: `tests/support/cli-test-process.ts`

**Interfaces:**

- Consumes: stable errors and mutation metadata from #19–#22 and #26.
- Produces: automated scenarios 9–12.

- [ ] **Step 1: Add no-op metadata tests**

For each documented idempotent operation, run the equivalent MCP and CLI command against matching task state. Assert:

- full resulting task equality;
- identical no-op action;
- identical changed-field list;
- identical `from` and `to` metadata;
- no timestamp changes not allowed by the contract.

- [ ] **Step 2: Add table-driven contract-error tests**

Add one case each for:

```text
blank or over-limit title
malformed identifier
task not found
invalid lifecycle transition
mutation of an archived task
invalid enum/status/priority input
missing required session
malformed session
```

For each case, compare stable error code, public message, allowed details, CLI exit code, and MCP error classification. Assert neither response contains stack traces, SQL, absolute paths, environment values, or internal class names.

- [ ] **Step 3: Add deterministic storage-error tests**

Use an explicit disposable path that is guaranteed to be unusable without touching user data, such as a database path whose parent component is an existing regular file inside the test root. Start both adapters with that same path and assert the documented storage error mapping, CLI exit code, MCP failure shape, and protocol-clean stdout.

Do not chmod paths because permission behavior differs across Windows and Unix.

- [ ] **Step 4: Add protocol-cleanliness assertions**

Extend `McpTestClient` to expose captured raw server stderr only; rely on the SDK transport for stdout. Add success and failure tests that would fail if application diagnostics are written to MCP stdout because SDK parsing/connection fails. Explicitly assert expected diagnostics, when present, appear only in stderr and contain no secrets or full source context.

- [ ] **Step 5: Run the focused parity suite**

Run:

```bash
pnpm build:node
pnpm vitest run tests/integration/mcp-cli-parity.test.ts
```

Expected: PASS for all parity, no-op, error, exit-code, storage, and protocol cases.

- [ ] **Step 6: Commit error and protocol coverage**

```bash
git add tests/integration/mcp-cli-parity.test.ts tests/support/mcp-test-client.ts tests/support/cli-test-process.ts
git commit -m "test: verify adapter errors and protocol cleanliness"
```

---

### Task 5: Prove one database path across HTTP, MCP, and CLI

**Files:**

- Create: `tests/integration/database-path-parity.test.ts`

**Interfaces:**

- Consumes: `createTaskRuntime({ databasePath })`, `createHttpServer`, Task 1 runtime, Task 2 clients, and native `fetch`.
- Produces: automated scenario 14 and arbitrary-working-directory database-path verification.

- [ ] **Step 1: Write the three-adapter failing test**

Use one `AgentTestRuntime.databasePath` and:

1. start the HTTP runtime/server with that exact path;
2. capture task A through MCP from working directory `cwd/mcp`;
3. retrieve task A through CLI from `cwd/cli`;
4. mutate task A through CLI and retrieve the changed representation through HTTP;
5. create human task B through HTTP;
6. retrieve task B through MCP and CLI list/get as allowed by provenance/session contracts;
7. stop all adapters and enumerate the disposable root.

Assert only the configured database and its expected SQLite sidecars exist; no `relay.db`, `.relay`, or database file appears under either arbitrary CWD.

- [ ] **Step 2: Run the focused test and verify behavior**

Run:

```bash
pnpm build:node
pnpm vitest run tests/integration/database-path-parity.test.ts
```

Expected: PASS when every adapter resolves `RELAY_DB_PATH` consistently. A failure showing an extra database file is a production configuration bug and must not be worked around in the test.

- [ ] **Step 3: Add restart coverage with the same path**

Stop HTTP, MCP, and CLI activity; start a new HTTP runtime on the same disposable path; assert both tasks and the CLI mutation remain visible. Ensure cleanup occurs only after every process/server/runtime closes.

- [ ] **Step 4: Run coverage and commit**

Run:

```bash
pnpm vitest run tests/integration/database-path-parity.test.ts
pnpm test:coverage
```

Expected: PASS and all four coverage dimensions remain at or above 80%.

Commit:

```bash
git add tests/integration/database-path-parity.test.ts
git commit -m "test: verify shared database path across adapters"
```

---

### Task 6: Strengthen canonical skill and vendor-asset drift checks

**Files:**

- Modify: `scripts/validate-agent-integration-assets.ts`
- Modify: `tests/unit/scripts/validate-agent-integration-assets.test.ts`
- Modify fixture files under: `tests/fixtures/agent-integrations/`

**Interfaces:**

- Consumes: canonical skill files from #23, vendor wrappers/config templates from #24, and repository asset validation entry point.
- Produces: deterministic automated scenario 15 plus removal-preserves-data policy coverage from scenario 16.

- [ ] **Step 1: Add failing positive and negative tests**

Add one focused negative fixture/test for each rule:

```text
canonical capture skill omits autonomous-create permission
canonical capture skill permits autonomous complete/archive/triage/edit/delete
canonical session-review skill omits all-status retrieval or explicit-user-action rule
vendor wrapper copies and contradicts mutation permissions
vendor wrapper does not reference both canonical skills
config template points to a non-canonical MCP entry or renames canonical tools
removal instructions tell the user to delete the SQLite database
removal instructions fail to distinguish configuration removal from data deletion
```

Also keep one complete fixture that passes all existing and new rules.

- [ ] **Step 2: Run the validator tests and verify failure**

Run:

```bash
pnpm vitest run tests/unit/scripts/validate-agent-integration-assets.test.ts
```

Expected: FAIL for unimplemented rules.

- [ ] **Step 3: Implement deterministic checks**

Extend `validateAgentIntegrationAssets` using explicit required phrases/headings and forbidden policy statements already established by #23/#24. Keep checks structural and deterministic:

- verify canonical skill paths exist;
- verify wrappers link/reference canonical paths;
- reject wrapper sections that redefine autonomy permissions;
- verify canonical MCP entry `dist/mcp/main.js` and documented tool names;
- require removal guidance to state that config/skill references are removed while the database remains untouched.

Do not build a Markdown parser framework or semantic policy engine.

- [ ] **Step 4: Run validator and repository asset gates**

Run:

```bash
pnpm vitest run tests/unit/scripts/validate-agent-integration-assets.test.ts
pnpm validate:assets
```

Expected: PASS.

- [ ] **Step 5: Commit drift checks**

```bash
git add scripts/validate-agent-integration-assets.ts tests/unit/scripts/validate-agent-integration-assets.test.ts tests/fixtures/agent-integrations
git commit -m "test: prevent agent integration policy drift"
```

---

### Task 7: Record manual Codex and Claude Code evidence and close the verification gate

**Files:**

- Create: `docs/agent-integration-verification.md`
- Modify: `docs/agent-integration.md` only for verified inaccuracies found during manual testing.

**Interfaces:**

- Consumes: issue #24 setup instructions, canonical skills, built artifacts, isolated database workflow, and all automated test results.
- Produces: manual scenarios for Codex and Claude Code, scenario matrix, known limitations, clean-checkout evidence, and Epic #2 closure checklist.

- [ ] **Step 1: Create the evidence document structure**

Use these exact top-level sections:

```markdown
# Agent Integration Verification

## Scope and safety statement

## Automated scenario matrix

## Clean-checkout environment

## Codex validation

## Claude Code validation

## Cross-client differences and limitations

## Data and configuration preservation

## Epic #2 closure checklist
```

The automated matrix must contain all 16 issue scenarios with columns `Scenario`, `Automated test or manual step`, `Result`, and `Evidence`.

- [ ] **Step 2: Perform clean-checkout preparation**

From a clean source checkout:

```bash
corepack enable
nvm use
pnpm install --frozen-lockfile
pnpm build
```

Create a unique disposable directory and set `RELAY_DB_PATH` to `<disposable-directory>/relay.db`. Record OS, Node version, pnpm version, commit SHA, database strategy without exposing a personal home path, and confirmation that the default database/configuration was not touched.

- [ ] **Step 3: Validate Codex using issue #24 instructions exactly**

Record:

- Codex version and OS;
- exact configuration scope/path used;
- MCP tool discovery result;
- a representative coding task;
- at least two autonomously captured follow-ups in one session;
- `session_captures_list` before final completion;
- one lifecycle action performed only after explicit direction;
- CLI JSON fallback command/result;
- disable/remove integration configuration;
- proof that data remains readable afterward.

Do not edit the user's normal Codex configuration. Use a disposable profile/config location or a manually isolated test configuration supported by the verified client instructions.

- [ ] **Step 4: Validate Claude Code equivalently**

Repeat the same workflow using Claude Code's officially supported MCP and instruction mechanism. Record exact client version, scope, commands, tool discovery, session review, explicit lifecycle action, CLI fallback, removal, persistence, and any behavioral/configuration difference from Codex.

- [ ] **Step 5: Correct only verified documentation inaccuracies**

If a current client version invalidates an issue #24 command or limitation, update `docs/agent-integration.md` and the relevant vendor README in the smallest possible commit. Record the discrepancy in the verification document rather than hiding it.

- [ ] **Step 6: Run all authoritative automated gates**

Run:

```bash
pnpm install --frozen-lockfile
pnpm build
pnpm test -- tests/integration/mcp-cli-parity.test.ts
pnpm test -- tests/integration/agent-workflow-e2e.test.ts
pnpm test -- tests/integration/database-path-parity.test.ts
pnpm validate:assets
pnpm verify
git status --short
```

Expected:

- every focused suite passes;
- `pnpm verify` passes formatting, lint, type checking, coverage, build, asset validation, and high-severity audit;
- verification does not rewrite tracked files;
- only intentional issue #25 files remain changed before commit.

- [ ] **Step 7: Perform the required human review gates**

A human reviewer must:

1. inspect temporary database/process cleanup and confirm no default path is reachable;
2. inspect normalizers and confirm they unwrap transports without hiding parity failures;
3. independently perform at least one end-to-end client workflow;
4. inspect persisted `sourceContext` samples for sensitive or oversized data;
5. confirm every issue #19 contract is represented in the automated matrix;
6. confirm all Epic #2 child issues are merged and reviewed before closure.

- [ ] **Step 8: Commit final evidence**

```bash
git add docs/agent-integration-verification.md docs/agent-integration.md integrations/codex/README.md integrations/claude-code/README.md
git commit -m "docs: record agent integration verification evidence"
```

Stage only files that actually changed; omit unchanged documentation/vendor paths from `git add`.

---

## Final Self-Review Checklist

Before opening the implementation PR:

- [ ] Every one of the 16 authoritative scenarios maps to a named automated test or manual evidence row.
- [ ] Every automated test uses a fresh explicit disposable database path.
- [ ] MCP and CLI parity compares complete public DTOs and stable metadata.
- [ ] Normalizers do not sort, rename, coerce, or drop contract fields.
- [ ] Session tests include open, completed, and archived captures and isolate two session IDs.
- [ ] Error tests cover validation, not-found, invalid transition, archived restriction, malformed session, and deterministic storage failure.
- [ ] CLI exit codes and MCP protocol cleanliness are asserted on success and failure.
- [ ] Different working directories create no extra database files.
- [ ] Skill/vendor checks reject conflicting autonomy policy and destructive removal guidance.
- [ ] Manual Codex and Claude Code records include version, OS, commands, results, limitations, and preserved data.
- [ ] `pnpm verify` passes from a frozen install without weakening coverage or asset gates.
- [ ] No real user database, source context, client configuration, or external LLM was touched by automated tests.
