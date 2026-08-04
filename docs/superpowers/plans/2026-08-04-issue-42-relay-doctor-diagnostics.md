# Issue #42 Relay Doctor Diagnostics Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Implement `relay doctor` as a deterministic, schema-versioned, non-destructive diagnostic command that verifies an installed Relay environment, isolates MCP/UI smoke checks from user data, and reports actionable healthy, warning, failure, or skipped results.

**Architecture:** Add a diagnosis subsystem under `src/distribution/doctor/` whose checks return typed data and never write output directly. A single orchestrator runs ordered checks, converts thrown implementation errors into sanitized diagnostic failures, and feeds one human/JSON renderer through the existing CLI dispatcher. Filesystem, SQLite, process, MCP, HTTP, and client-configuration checks remain separate modules so they can be tested with injected dependencies and temporary fixtures.

**Tech Stack:** Node.js 24 (`>=24 <25`), TypeScript/ESM, pnpm 10.2.0, `better-sqlite3`, official `@modelcontextprotocol/sdk`, Node child processes/fetch/filesystem primitives, Vitest, existing Relay runtime-path/package-asset/setup ownership contracts.

## Global Constraints

- Public package name remains `@krishna916/relay`; executable remains `relay`.
- Supported release claims remain Windows x64, macOS arm64, and Linux x64/glibc only.
- Doctor accepts only `relay doctor` and `relay doctor --output json`; reject unknown flags with exit code `2`.
- Human output is the default. JSON output writes exactly one schema-versioned document plus a newline to stdout; diagnostics do not leak onto stdout.
- Overall exit code is `0` when there are no `failure` checks, including warning-only reports; return `1` when one or more checks fail; preserve `2` for command usage errors.
- Check order and check identifiers are public deterministic contracts. Do not run checks concurrently.
- Every check reports exactly one status: `healthy`, `warning`, `failure`, or `skipped`, with a stable code and sanitized message.
- Doctor must not create, migrate, replace, truncate, repair, or delete the configured Relay database.
- Doctor must not mutate client configuration, Relay ownership metadata, or installed package assets.
- Directory writability checks use metadata/access checks only; do not probe by creating files in user directories.
- Database checks use a read-only, file-must-exist SQLite connection and read-only pragmas/queries only.
- MCP and UI startup checks must use an isolated temporary root and temporary database, never the configured database.
- Temporary diagnostic resources may be created only under the OS temporary directory and must be removed in `finally`.
- Child processes must be terminated on success, failure, timeout, `SIGINT`, and `SIGTERM`; no process may outlive doctor.
- Never print complete configuration files, environment variables, SQL text, stack traces, secret-like values, unrelated keys, or raw child-process output.
- Human output may show approved resolved paths: package root, executable path, data root, config root, database path, ownership metadata path, and explicitly recorded integration config paths.
- Doctor must inspect Codex and Claude Code only through Relay ownership records in `config.json`; do not scan home directories or infer native client paths.
- Generic MCP configuration has no owned mutable file in the current contract; validate the packaged generic template and report configuration presence as skipped with reason.
- Reuse `resolvePackageAssets()`, `resolveRuntimePaths()`, `readPackageVersion()`, `resolveOwnershipMetadataPath()`, setup client adapters, ownership-store validation, migration naming/contracts, MCP server, and HTTP server. Do not duplicate their business rules.
- Do not add a repair framework, telemetry, remote upload, daemon, shell/PATH mutation, or new runtime dependency.
- Tests must inject temporary roots, clocks, child-process launchers, timeouts, and fixture files. They must never inspect or mutate real user paths.
- `pnpm verify` and `RELAY_RUN_PACKAGE_SMOKE=1 pnpm verify:package` must pass.

---

## Locked Public Report Contract

Use these exact types and check order:

```ts
export const DOCTOR_REPORT_SCHEMA_VERSION = 1 as const;

export type DoctorStatus = 'healthy' | 'warning' | 'failure' | 'skipped';

export type DoctorCheckId =
  | 'runtime.version'
  | 'runtime.platform'
  | 'package.assets'
  | 'paths.resolution'
  | 'paths.access'
  | 'database.state'
  | 'database.integrity'
  | 'database.native-addon'
  | 'integrations.codex'
  | 'integrations.claude-code'
  | 'integrations.generic-mcp'
  | 'compatibility.assets'
  | 'mcp.handshake'
  | 'ui.loopback';

export interface DoctorCheckResult {
  readonly id: DoctorCheckId;
  readonly status: DoctorStatus;
  readonly code: string;
  readonly message: string;
  readonly details?: Readonly<Record<string, string | number | boolean | readonly string[]>>;
  readonly durationMs: number;
}

export interface DoctorReport {
  readonly schemaVersion: 1;
  readonly relayVersion: string;
  readonly generatedAt: string;
  readonly summary: {
    readonly healthy: number;
    readonly warning: number;
    readonly failure: number;
    readonly skipped: number;
  };
  readonly checks: readonly DoctorCheckResult[];
}
```

Rules:

- `generatedAt` is the only clock-dependent field and must be injected in tests.
- `durationMs` is an integer greater than or equal to zero and is measured per check with an injected monotonic clock.
- `details` keys are check-specific but fixed by tests. Omit absent optional values instead of emitting `null`.
- Stable codes use lowercase dot-separated identifiers such as `runtime.version.supported`, `database.missing`, and `mcp.timeout`.
- Unexpected internal exceptions become a failure with code `<check-id>.internal-error` and message `The diagnostic check could not be completed safely.` The original exception may be logged only in tests; never expose it in production output.
- Human output prints one line per check, then a summary. Do not print raw JSON fragments in human mode.

---

## Locked File Responsibilities

```text
src/distribution/doctor/
  doctor-types.ts                 public report/check contracts and ordered check IDs
  run-doctor.ts                   sequential orchestration, timing, sanitization, cleanup scope
  check-runtime.ts                Node version and platform/architecture support
  check-package-assets.ts         executable/package root and immutable asset presence
  check-paths.ts                  resolved path validity and access metadata
  check-database.ts               read-only state, migration, quick_check, native addon
  check-integrations.ts           ownership-backed Codex/Claude validation and generic template
  check-compatibility.ts          package/MCP/migration/skill/template version compatibility
  child-process-probe.ts          timeout, bounded capture, signal cleanup, process termination
  check-mcp.ts                    isolated stdio initialize/listTools probe
  check-ui.ts                     isolated loopback startup/health probe

src/interfaces/cli/
  parse-doctor-command.ts         exact doctor grammar
  run-doctor-command.ts           production dependency assembly and exit code
  doctor-output.ts                human and JSON rendering
  run-relay.ts                    dispatch only
  main.ts                         wire doctor runner

tests/unit/distribution/doctor/
tests/unit/interfaces/cli/doctor-command.test.ts
tests/integration/doctor-installed-package.test.ts
tests/fixtures/doctor/
```

Do not put diagnostic logic in `main.ts`, `run-relay.ts`, output rendering, or tests.

---

### Task 1: Define doctor contracts, fixtures, and deterministic orchestration

**Files:**

- Create: `src/distribution/doctor/doctor-types.ts`
- Create: `src/distribution/doctor/run-doctor.ts`
- Create: `tests/unit/distribution/doctor/run-doctor.test.ts`
- Create: `tests/fixtures/doctor/README.md`
- Modify: `scripts/validate-repository-assets.ts`
- Modify: `tests/unit/scripts/validate-repository-assets.test.ts`

**Interfaces:**

```ts
export interface DoctorCheckContext {
  readonly applicationVersion: string;
  readonly now: () => Date;
  readonly monotonicNow: () => number;
}

export interface DoctorCheck {
  readonly id: DoctorCheckId;
  run(): Promise<Omit<DoctorCheckResult, 'id' | 'durationMs'>>;
}

export async function runDoctor(input: {
  readonly context: DoctorCheckContext;
  readonly checks: readonly DoctorCheck[];
}): Promise<DoctorReport>;
```

- [ ] **Step 1: Write failing tests for exact status, ID, summary, timing, and exception behavior.**

Cover one result of each status, stable input order, integer duration calculation, exact summary counts, fixed `generatedAt`, and conversion of a thrown error into `<id>.internal-error` without including the thrown message or stack.

- [ ] **Step 2: Run the focused test and confirm the missing contracts fail.**

```bash
pnpm test -- tests/unit/distribution/doctor/run-doctor.test.ts
```

Expected: FAIL because the doctor contracts and orchestrator do not exist.

- [ ] **Step 3: Implement the exact public types and immutable ordered ID list.**

Export `DOCTOR_CHECK_ORDER` containing the 14 IDs exactly as listed in the public contract. `runDoctor()` must reject duplicate/missing/out-of-order injected checks in development/tests so production cannot silently change JSON ordering.

- [ ] **Step 4: Implement sequential execution and sanitization.**

Call each check exactly once. Measure duration around only that check. Do not short-circuit after failures because later diagnostics may explain the environment.

- [ ] **Step 5: Extend repository asset validation for doctor fixtures.**

Reject fixture files containing real home-directory prefixes, access tokens, private keys, or source-checkout absolute paths. Fixtures must use placeholders or temporary-path generation.

- [ ] **Step 6: Run focused tests and type checking.**

```bash
pnpm test -- tests/unit/distribution/doctor/run-doctor.test.ts tests/unit/scripts/validate-repository-assets.test.ts
pnpm typecheck
```

Expected: PASS.

- [ ] **Step 7: Commit the contracts and orchestrator.**

```bash
git add src/distribution/doctor tests/unit/distribution/doctor tests/fixtures/doctor scripts/validate-repository-assets.ts tests/unit/scripts/validate-repository-assets.test.ts
git commit -m "test: define deterministic doctor report contracts"
```

---

### Task 2: Diagnose runtime, platform, executable, and immutable package assets

**Files:**

- Create: `src/distribution/doctor/check-runtime.ts`
- Create: `src/distribution/doctor/check-package-assets.ts`
- Create: `tests/unit/distribution/doctor/check-runtime.test.ts`
- Create: `tests/unit/distribution/doctor/check-package-assets.test.ts`
- Modify: `src/distribution/package-assets.ts` only if a narrow reusable asset manifest helper is required

**Interfaces:**

```ts
export function createRuntimeVersionCheck(input: {
  readonly nodeVersion: string;
  readonly expectedMajor: 24;
}): DoctorCheck;

export function createRuntimePlatformCheck(input: {
  readonly platform: NodeJS.Platform;
  readonly arch: string;
  readonly report: { readonly glibc?: string };
}): DoctorCheck;

export function createPackageAssetsCheck(input: {
  readonly executablePath: string;
  readonly assets: PackageAssets;
  readonly access: typeof import('node:fs/promises').access;
  readonly realpath: typeof import('node:fs/promises').realpath;
}): DoctorCheck;
```

- [ ] **Step 1: Write failing runtime matrix tests.**

Healthy: Node `24.x`; Windows/x64; Darwin/arm64; Linux/x64 with glibc. Failure: Node below/above range, unsupported architecture, Linux without glibc. Messages must state the supported requirement without dumping `process.report`.

- [ ] **Step 2: Write failing package-asset tests.**

Assert the executable resolves independently of `cwd`; package root, migrations, web, skills, and integrations exist and are readable; symlink/realpath resolution is deterministic. Missing executable or any required immutable asset is a failure naming only the approved asset label/path.

- [ ] **Step 3: Implement runtime checks without third-party semver/platform packages.**

Parse the Node major from `process.versions.node`. Use `process.report.getReport().header.glibcVersionRuntime` only for Linux glibc detection and expose only a boolean/version string.

- [ ] **Step 4: Implement asset checks by reusing `resolvePackageAssets()`.**

Do not search upward from `cwd`; production must seed the resolver from `import.meta.url`/the installed CLI module. Check readability with `access(path, R_OK)` and resolve the approved paths with `realpath()`.

- [ ] **Step 5: Run focused tests.**

```bash
pnpm test -- tests/unit/distribution/doctor/check-runtime.test.ts tests/unit/distribution/doctor/check-package-assets.test.ts
pnpm typecheck
```

Expected: PASS.

- [ ] **Step 6: Commit runtime and package diagnostics.**

```bash
git add src/distribution/doctor src/distribution/package-assets.ts tests/unit/distribution/doctor
git commit -m "feat: diagnose Relay runtime and installed assets"
```

---

### Task 3: Diagnose resolved mutable paths without modifying them

**Files:**

- Create: `src/distribution/doctor/check-paths.ts`
- Create: `tests/unit/distribution/doctor/check-paths.test.ts`
- Modify: `src/interfaces/production-dependencies.ts`

**Interfaces:**

```ts
export function createPathResolutionCheck(input: {
  readonly runtimePaths: RuntimePaths;
  readonly metadataPath: string;
}): DoctorCheck;

export function createPathAccessCheck(input: {
  readonly runtimePaths: RuntimePaths;
  readonly metadataPath: string;
  readonly access: typeof import('node:fs/promises').access;
  readonly stat: typeof import('node:fs/promises').stat;
}): DoctorCheck;
```

- [ ] **Step 1: Write failing resolution tests.**

Assert all mutable paths are absolute, normalized, outside the package root where applicable, and unchanged by arbitrary `cwd`. An invalid/relative injected path is a failure.

- [ ] **Step 2: Write failing access-state tests.**

Use fixtures for missing data/config directories, unreadable directories, unwritable directories, missing metadata, and a database path whose parent is inaccessible. Missing ownership metadata is a warning, not a failure. Missing required data/config roots after setup is a failure with the action `Run relay setup` in the message.

- [ ] **Step 3: Implement access checks with `stat()` and `access(R_OK | W_OK)` only.**

Do not create probe files or directories. Report only approved path fields and booleans such as `exists`, `readable`, and `writable`.

- [ ] **Step 4: Add reusable production dependency fields.**

Extend production doctor dependency assembly to provide `runtimePaths`, `resolveOwnershipMetadataPath(runtimePaths)`, and package assets once. Do not recalculate them independently in checks.

- [ ] **Step 5: Run focused tests.**

```bash
pnpm test -- tests/unit/distribution/doctor/check-paths.test.ts
pnpm typecheck
```

Expected: PASS.

- [ ] **Step 6: Commit path diagnostics.**

```bash
git add src/distribution/doctor/check-paths.ts src/interfaces/production-dependencies.ts tests/unit/distribution/doctor/check-paths.test.ts
git commit -m "feat: diagnose Relay runtime paths safely"
```

---

### Task 4: Add read-only database, migration, integrity, and native-addon checks

**Files:**

- Create: `src/distribution/doctor/check-database.ts`
- Create: `tests/unit/distribution/doctor/check-database.test.ts`
- Create: `tests/fixtures/doctor/database/` fixture builder/helper
- Modify: existing migration module only to export a read-only migration manifest/version helper

**Interfaces:**

```ts
export interface DatabaseDiagnosticState {
  readonly exists: boolean;
  readonly appliedMigrations: readonly string[];
  readonly availableMigrations: readonly string[];
  readonly pendingMigrations: readonly string[];
  readonly unknownMigrations: readonly string[];
}

export function inspectDatabaseReadOnly(input: {
  readonly databasePath: string;
  readonly migrationsDir: string;
  readonly openReadOnly: (path: string) => import('better-sqlite3').Database;
}): DatabaseDiagnosticState;

export function createDatabaseStateCheck(...): DoctorCheck;
export function createDatabaseIntegrityCheck(...): DoctorCheck;
export function createNativeAddonCheck(...): DoctorCheck;
```

- [ ] **Step 1: Write failing tests for missing and migration states.**

Cover: missing database (warning, `database.missing`); current database (healthy); pending known migrations (failure); unknown/newer migration rows (failure); missing or unreadable migration ledger (failure); malformed database (failure). Snapshot database bytes and mtime before/after every check and assert they are unchanged.

- [ ] **Step 2: Write failing integrity tests.**

Run `PRAGMA quick_check` on the read-only connection. `ok` is healthy; any other returned row is failure `database.integrity-failed` without printing page numbers/raw engine text. Locked/busy/read errors become sanitized failures.

- [ ] **Step 3: Write failing native-addon tests.**

Successful import/open of a temporary read-only fixture is healthy. Module load/ABI errors are failure `database.native-addon-load-failed`, reporting Node ABI (`process.versions.modules`) and package version only, never a stack trace.

- [ ] **Step 4: Export one canonical migration manifest reader.**

Reuse the same filename ordering and validation as production migration execution. Do not parse or execute migration SQL in doctor.

- [ ] **Step 5: Implement `better-sqlite3` read-only connections.**

Use `{ readonly: true, fileMustExist: true }`; set no write pragmas; close in `finally`. Never call the normal runtime factory because it runs forward migrations.

- [ ] **Step 6: Run focused and existing migration tests.**

```bash
pnpm test -- tests/unit/distribution/doctor/check-database.test.ts tests/unit/database
pnpm typecheck
```

Expected: PASS and all byte/mtime non-mutation assertions pass.

- [ ] **Step 7: Commit database diagnostics.**

```bash
git add src/distribution/doctor/check-database.ts tests/unit/distribution/doctor/check-database.test.ts tests/fixtures/doctor/database src/database
git commit -m "feat: add read-only Relay database diagnostics"
```

---

### Task 5: Validate owned agent configurations and cross-asset compatibility

**Files:**

- Create: `src/distribution/doctor/check-integrations.ts`
- Create: `src/distribution/doctor/check-compatibility.ts`
- Create: `tests/unit/distribution/doctor/check-integrations.test.ts`
- Create: `tests/unit/distribution/doctor/check-compatibility.test.ts`
- Modify: `src/distribution/setup/ownership-store.ts` only to expose a read-only validated load helper if needed
- Modify: skill/template metadata files only if issue #39 contracts already define version fields that are not machine-readable

**Interfaces:**

```ts
export function createIntegrationChecks(input: {
  readonly ownershipStore: OwnershipStore;
  readonly adapters: Readonly<Record<MutableIntegrationClient, ClientConfigAdapter>>;
  readonly integrationsDir: string;
  readonly readFile: typeof import('node:fs/promises').readFile;
  readonly access: typeof import('node:fs/promises').access;
}): readonly [DoctorCheck, DoctorCheck, DoctorCheck];

export function createCompatibilityCheck(input: {
  readonly applicationVersion: string;
  readonly migrationsDir: string;
  readonly skillsDir: string;
  readonly integrationsDir: string;
}): DoctorCheck;
```

- [ ] **Step 1: Write failing owned-integration tests.**

For each Codex/Claude check cover: no ownership record (warning); disabled record (warning); enabled exact entry (healthy); missing recorded file (failure); malformed file (failure); missing exact `relay` entry (failure); conflicting command/args (failure); inaccessible file (failure). Never include unrelated keys or secret fixture values in result/output.

- [ ] **Step 2: Lock behavior for multiple records.**

If multiple ownership records exist for one client at distinct explicit paths, validate all in normalized path order and summarize counts in one client check. Any invalid enabled record makes the client check fail; disabled records remain warnings unless another enabled record is healthy.

- [ ] **Step 3: Define generic MCP behavior.**

Validate the packaged generic template parses and invokes `relay` with `['mcp']`. Report `skipped` with code `integrations.generic-mcp.user-config-not-owned` because Relay has no approved generic client config path to inspect. A missing/invalid packaged template is instead a failure.

- [ ] **Step 4: Write failing compatibility tests.**

Validate package version, migration manifest version/count, MCP contract/schema version, canonical skill metadata version, and installed integration template version against the machine-readable compatibility metadata established by issue #39. Missing, malformed, newer, or incompatible assets are failures; exact compatible versions are healthy.

- [ ] **Step 5: Implement compatibility by reading metadata, never by scraping prose.**

If current issue #39 assets lack one machine-readable compatibility manifest, add exactly one immutable packaged file such as `assets/compatibility.json` with schema version `1`; update package staging/allowlist/asset validation tests in the same step. Do not create separate version files per subsystem.

- [ ] **Step 6: Run focused setup/asset tests.**

```bash
pnpm test -- tests/unit/distribution/doctor/check-integrations.test.ts tests/unit/distribution/doctor/check-compatibility.test.ts tests/unit/distribution/setup tests/unit/scripts
pnpm validate:assets
pnpm typecheck
```

Expected: PASS.

- [ ] **Step 7: Commit integration and compatibility diagnostics.**

```bash
git add src/distribution/doctor src/distribution/setup assets skills integrations scripts tests/unit/distribution/doctor tests/unit/distribution/setup tests/unit/scripts
git commit -m "feat: validate Relay integrations and asset compatibility"
```

---

### Task 6: Implement one reusable, cleanup-safe child-process probe

**Files:**

- Create: `src/distribution/doctor/child-process-probe.ts`
- Create: `tests/unit/distribution/doctor/child-process-probe.test.ts`
- Create: `tests/fixtures/doctor/process/healthy-child.mjs`
- Create: `tests/fixtures/doctor/process/hanging-child.mjs`
- Create: `tests/fixtures/doctor/process/spawn-grandchild.mjs`

**Interfaces:**

```ts
export interface ChildProcessProbeResult {
  readonly exitCode: number | null;
  readonly signal: NodeJS.Signals | null;
  readonly stdout: string;
  readonly stderr: string;
  readonly timedOut: boolean;
}

export async function runChildProcessProbe(input: {
  readonly command: string;
  readonly args: readonly string[];
  readonly cwd: string;
  readonly env: NodeJS.ProcessEnv;
  readonly timeoutMs: number;
  readonly maxCaptureBytes: number;
  readonly onSpawn?: (child: import('node:child_process').ChildProcess) => void;
}): Promise<ChildProcessProbeResult>;
```

- [ ] **Step 1: Write failing success/failure/timeout/capture-limit tests.**

Use exact constants `DOCTOR_MCP_TIMEOUT_MS = 5_000`, `DOCTOR_UI_TIMEOUT_MS = 8_000`, and `DOCTOR_MAX_CAPTURE_BYTES = 32_768`. Capture beyond the limit must be truncated internally and never forwarded raw to report output.

- [ ] **Step 2: Write failing cleanup tests.**

Assert normal exit, non-zero exit, timeout, thrown parser callback, `SIGINT`, and `SIGTERM` all remove the child from the active registry. On POSIX, start the child detached and terminate its process group; on Windows use non-detached spawn plus `taskkill /T /F` fallback only for the diagnostic child PID. Unit-test platform branches with injected kill functions.

- [ ] **Step 3: Implement an active-child registry and one cleanup function.**

Install process signal handlers only while `runDoctorCommand()` is active. Cleanup must be idempotent. After cleanup, restore/remove only handlers installed by doctor.

- [ ] **Step 4: Use graceful-then-force termination.**

Send `SIGTERM`, wait up to 500 ms, then force termination. Never wait indefinitely. Treat already-exited/`ESRCH` as successful cleanup.

- [ ] **Step 5: Run focused tests and inspect for leaked fixtures.**

```bash
pnpm test -- tests/unit/distribution/doctor/child-process-probe.test.ts
pnpm typecheck
```

Expected: PASS; no fixture process remains after the suite.

- [ ] **Step 6: Commit the process-probe primitive.**

```bash
git add src/distribution/doctor/child-process-probe.ts tests/unit/distribution/doctor/child-process-probe.test.ts tests/fixtures/doctor/process
git commit -m "feat: add cleanup-safe doctor process probes"
```

---

### Task 7: Smoke-test installed MCP and UI against isolated temporary data

**Files:**

- Create: `src/distribution/doctor/check-mcp.ts`
- Create: `src/distribution/doctor/check-ui.ts`
- Create: `tests/unit/distribution/doctor/check-mcp.test.ts`
- Create: `tests/unit/distribution/doctor/check-ui.test.ts`
- Modify: `src/interfaces/http/main.ts` only if a machine-readable ready signal is required
- Modify: `src/interfaces/http/create-http-server.ts` only if `/health` is not already available

**Interfaces:**

```ts
export interface InstalledRelayCommand {
  readonly command: string;
  readonly prefixArgs: readonly string[];
}

export function resolveInstalledRelayCommand(input: {
  readonly execPath: string;
  readonly argv1: string;
}): InstalledRelayCommand;

export function createMcpHandshakeCheck(input: {
  readonly installedCommand: InstalledRelayCommand;
  readonly temporaryRootFactory: () => Promise<{ path: string; cleanup(): Promise<void> }>;
}): DoctorCheck;

export function createUiLoopbackCheck(input: {
  readonly installedCommand: InstalledRelayCommand;
  readonly temporaryRootFactory: () => Promise<{ path: string; cleanup(): Promise<void> }>;
  readonly fetch: typeof globalThis.fetch;
}): DoctorCheck;
```

- [ ] **Step 1: Lock installed command resolution.**

Production uses `process.execPath` plus the installed CLI script at `process.argv[1]`, yielding `node <installed-package>/dist/cli/main.js ...`. This exercises the same installed executable implementation without depending on shell aliases or `cwd`. Agent command validity separately confirms recorded/template command is exactly `relay` with `['mcp']`.

- [ ] **Step 2: Write failing MCP tests.**

Use official SDK `Client` with `StdioClientTransport` to initialize against `<installed-command> mcp`, then call `listTools()`. Assert the canonical Relay tool names are present according to the existing MCP contract. Cover spawn failure, early exit, invalid protocol, missing tools, timeout, and cleanup.

- [ ] **Step 3: Isolate MCP state.**

Create a temporary root/database and set only diagnostic child environment overrides (`RELAY_DB_PATH` to an absolute temp path plus inherited environment). The child may migrate/write that temporary database. Assert the configured real database bytes/mtime are untouched and temp resources are removed.

- [ ] **Step 4: Write failing UI tests.**

Spawn `<installed-command> ui` with an isolated temp database and arbitrary temp `cwd`. Parse only the bounded machine-readable ready URL from stderr, require loopback host (`127.0.0.1`, `::1`, or `localhost`), call the existing `/health` endpoint, require expected success body/status, then terminate and clean up.

- [ ] **Step 5: Add a deterministic ready signal only if needed.**

Prefer an exact stderr line such as `[INFO] HTTP server running at <url>` already emitted by `runUiServer()`. Do not print readiness on stdout and do not expose a non-loopback bind option.

- [ ] **Step 6: Run focused MCP/HTTP regression tests.**

```bash
pnpm test -- tests/unit/distribution/doctor/check-mcp.test.ts tests/unit/distribution/doctor/check-ui.test.ts tests/unit/interfaces/mcp tests/unit/interfaces/http tests/integration/mcp-server.test.ts
pnpm typecheck
```

Expected: PASS with timeout and cleanup assertions.

- [ ] **Step 7: Commit installed smoke checks.**

```bash
git add src/distribution/doctor/check-mcp.ts src/distribution/doctor/check-ui.ts src/interfaces/http tests/unit/distribution/doctor tests/unit/interfaces tests/integration
git commit -m "feat: smoke test installed Relay MCP and UI"
```

---

### Task 8: Add CLI grammar, stable output, production wiring, and exit semantics

**Files:**

- Create: `src/interfaces/cli/parse-doctor-command.ts`
- Create: `src/interfaces/cli/doctor-output.ts`
- Create: `src/interfaces/cli/run-doctor-command.ts`
- Create: `tests/unit/interfaces/cli/doctor-command.test.ts`
- Modify: `src/interfaces/cli/run-relay.ts`
- Modify: `src/interfaces/cli/main.ts`
- Modify: `src/interfaces/production-dependencies.ts`
- Modify: CLI help/documentation tests if present

**Interfaces:**

```ts
export interface DoctorCommand {
  readonly output: 'human' | 'json';
}

export function parseDoctorCommand(argv: readonly string[]): DoctorCommand;
export function writeDoctorReport(stream: { write(text: string): unknown }, report: DoctorReport, output: DoctorCommand['output']): void;
export async function runDoctorCommand(argv: readonly string[], dependencies: DoctorCommandDependencies): Promise<number>;
```

- [ ] **Step 1: Write failing parser/dispatcher tests.**

Accept only `['doctor']` and `['doctor', '--output', 'json']`. Reject missing output value, unsupported output, duplicate flags, and unknown flags with exit `2`. Update `runRelay()` so only the exact top-level `doctor` command dispatches to `runDoctorCommand`.

- [ ] **Step 2: Write failing JSON snapshot tests.**

Assert exact schema/order/newline, no ANSI codes, no undefined/null optional fields, stable summary, and no stderr on a completed report. JSON output must be parseable after warning/failure reports.

- [ ] **Step 3: Write failing human-output tests.**

Use exact markers `[OK]`, `[WARN]`, `[FAIL]`, `[SKIP]`, followed by check ID and sanitized message. Print approved details indented and sorted by key. End with `Doctor summary: X healthy, Y warning, Z failure, W skipped.`

- [ ] **Step 4: Implement production dependency assembly once.**

Resolve application version, package assets, runtime paths, ownership path/store, installed CLI command, adapters, clocks, filesystem/process functions, and temporary-root factory. Construct checks in `DOCTOR_CHECK_ORDER`; do not let `main.ts` know check details.

- [ ] **Step 5: Implement exit semantics and signal cleanup.**

Return `0` for healthy/warning/skipped-only reports and `1` for any failure. Ensure cleanup runs before writing the final report and before resolving the command promise.

- [ ] **Step 6: Run focused CLI and existing dispatcher tests.**

```bash
pnpm test -- tests/unit/interfaces/cli/doctor-command.test.ts tests/unit/interfaces/cli/run-relay.test.ts
pnpm typecheck
```

Expected: PASS.

- [ ] **Step 7: Commit CLI integration.**

```bash
git add src/interfaces/cli src/interfaces/production-dependencies.ts tests/unit/interfaces/cli
git commit -m "feat: expose Relay doctor command"
```

---

### Task 9: Add installed-tarball and intentionally broken environment coverage

**Files:**

- Create: `tests/integration/doctor-installed-package.test.ts`
- Create: `scripts/package/smoke-doctor.ts` if reuse from the package smoke harness is cleaner
- Modify: `scripts/package/smoke-installed-package.ts`
- Modify: `package.json`
- Modify: package smoke test documentation/CI only as needed

**Interfaces:**

- Consumes: packed tarball installer and existing package smoke helpers.
- Produces: installed `relay doctor` coverage from arbitrary working directories.

- [ ] **Step 1: Add healthy installed-package coverage.**

Pack/install Relay into an isolated prefix, run `relay setup` against isolated paths, then run doctor from a different arbitrary directory in human and JSON modes. Assert exit `0`, schema version `1`, all check IDs in order, successful MCP/UI probes, and no unresolved source-checkout paths.

- [ ] **Step 2: Add broken installation matrices one fault at a time.**

Cover missing migration assets, missing web assets, unwritable data/config roots, missing database, pending migration, corrupt database, simulated native-addon load failure, malformed ownership metadata, invalid Codex command, invalid Claude command, MCP timeout/failure, and UI timeout/failure. Assert exact status/code and bounded sanitized output.

- [ ] **Step 3: Prove non-mutation and cleanup.**

For every fixture snapshot user database/config bytes and mtimes before/after. Assert no client/ownership changes, no database migrations, no leftover `.relay-doctor-*` temporary roots, and no child processes.

- [ ] **Step 4: Keep expensive package smoke opt-in locally.**

Integrate with the existing `RELAY_RUN_PACKAGE_SMOKE=1 pnpm verify:package` gate rather than adding doctor child-process installations to normal unit tests or `pnpm verify` twice.

- [ ] **Step 5: Run package verification.**

```bash
pnpm pack:tarball
pnpm verify:package:contents
RELAY_RUN_PACKAGE_SMOKE=1 pnpm verify:package
```

Expected: PASS from arbitrary working directories.

- [ ] **Step 6: Commit installed diagnostics coverage.**

```bash
git add tests/integration/doctor-installed-package.test.ts scripts/package package.json
git commit -m "test: verify Relay doctor in installed packages"
```

---

### Task 10: Document operation, safety boundaries, and human review matrix

**Files:**

- Create: `docs/doctor.md`
- Modify: `README.md`
- Modify: `docs/setup-and-configuration.md`
- Modify: relevant installation/agent-integration docs
- Modify: package/asset validation tests if documentation is validated

- [ ] **Step 1: Document exact commands and exit behavior.**

Include `relay doctor`, `relay doctor --output json`, status meanings, exit `0/1/2`, check list, approved path exposure, and the statement that warning-only output still exits `0`.

- [ ] **Step 2: Document non-destructive boundaries.**

State explicitly that doctor does not migrate/repair the configured database, edit client files, edit ownership metadata, scan for client configs, upload telemetry, or expose full configs. Explain that MCP/UI probes use disposable temporary data.

- [ ] **Step 3: Add troubleshooting guidance keyed by stable codes.**

Cover actions for unsupported runtime/platform, missing assets, path access, missing/pending/corrupt database, native-addon ABI failure, invalid owned integration, compatibility mismatch, MCP timeout, and UI loopback failure. Do not recommend destructive reset as the default action.

- [ ] **Step 4: Add the human review gate matrix.**

Using disposable installed environments, manually run and record:

1. healthy setup;
2. warning-only setup with no owned client integration;
3. unsupported Node/platform simulation;
4. missing immutable asset;
5. unwritable mutable path;
6. pending and corrupt database copies;
7. invalid Codex and Claude owned entries;
8. MCP timeout;
9. UI startup failure;
10. Ctrl+C during MCP and UI probes.

For each, verify status/code, exit code, no mutation, no leaked child, and no leaked secret fixture value.

- [ ] **Step 5: Run final verification.**

```bash
pnpm format
pnpm verify
RELAY_RUN_PACKAGE_SMOKE=1 pnpm verify:package
```

Expected: all gates pass with no formatting changes after `pnpm format:check`.

- [ ] **Step 6: Commit documentation.**

```bash
git add README.md docs integrations scripts tests package.json
git commit -m "docs: document Relay doctor diagnostics"
```

---

## Final Human Verification Gate

Before closing issue #42, the human reviewer must run the matrix in `docs/doctor.md` against isolated installed tarballs on at least the current host platform. The review must explicitly confirm:

- output is understandable without reading source;
- JSON ordering/schema/codes are stable;
- warning-only reports exit `0` and failures exit `1`;
- arbitrary working directories do not affect resolution;
- the real Relay database, ownership metadata, and client configs remain byte-for-byte unchanged;
- temporary roots are removed;
- MCP/UI children are terminated after success, failure, timeout, and interruption;
- no fixture secret, raw config, SQL, child output, or stack trace appears.

## Deferred Decisions

- Repair commands and automated remediation remain separate future issues.
- Remote diagnostic bundles/support uploads remain out of scope.
- Generic MCP client-file discovery remains unsupported until a client-specific ownership contract exists.
- Additional platforms, Node versions, database recovery, telemetry, and background health monitoring require explicit future decisions.
