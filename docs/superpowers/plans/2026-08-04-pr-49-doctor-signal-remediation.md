# PR #49 Doctor Signal Handling Remediation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Make `relay doctor` stop deterministically on `SIGINT` and `SIGTERM`, await child-process and temporary-resource cleanup, return conventional interrupted exit codes, and never continue later checks or print a completed report after interruption.

**Architecture:** Keep the existing doctor checks, stable 14-check schema, human/JSON output, child probe implementation, and installed-command smoke strategy. Add one command-scoped `AbortController` owned by `runDoctorCommand()`, make the signal handler record the first received signal and abort that controller, make `runDoctor()` stop at check boundaries by throwing a typed interruption error, and register temporary roots with the existing cleanup registry. Cleanup remains centralized and idempotent; library functions return exit codes rather than calling `process.exit()`.

**Tech Stack:** Node.js 24 (`>=24 <25`), TypeScript/ESM, Node signals and `AbortController`, Vitest, existing Relay doctor modules and installed-package test harness.

## Global Constraints

- Do not change the public commands: `relay doctor` and `relay doctor --output json`.
- Do not change doctor report schema version `1`, check IDs, check ordering, status values, stable diagnostic codes, or normal exit semantics.
- Normal doctor execution remains: exit `0` for healthy/warning/skipped-only reports, exit `1` when at least one check fails, and exit `2` for invalid usage.
- Interrupted execution returns `130` for `SIGINT` and `143` for `SIGTERM`.
- Interrupted execution must not write a completed human or JSON doctor report to stdout.
- Signal handling must not call `process.exit()` inside reusable doctor modules; `src/interfaces/cli/main.ts` continues to apply the returned exit code through `process.exitCode`.
- The first termination signal wins. A later signal must not change the selected exit code or start a second cleanup workflow.
- After interruption is recorded, no later doctor check may start.
- The currently running MCP/UI probe must be terminated through the cleanup coordinator.
- Temporary roots must be registered immediately after creation and removed on normal completion, check failure, timeout, `SIGINT`, and `SIGTERM`.
- Cleanup functions must be safe when invoked concurrently or more than once. Each registered cleanup action must execute at most once.
- Cleanup failures must not expose stack traces, child stderr, environment values, configuration contents, SQL, or temporary path details.
- Existing configured database, ownership metadata, and client configuration remain untouched.
- Tests must use isolated child processes and temporary directories and must never signal the Vitest worker process itself.
- Preserve Windows behavior. Unit tests that require POSIX process groups may remain conditionally skipped on Windows, but command-level signal semantics must be covered on every host where Node supports the signal used by the test.
- `pnpm verify` and `RELAY_RUN_PACKAGE_SMOKE=1 pnpm verify:package` must pass before re-review.

---

## Locked Behaviour and Interfaces

### Interruption type

Add a typed error used only as internal control flow:

```ts
export type DoctorTerminationSignal = 'SIGINT' | 'SIGTERM';

export class DoctorInterruptedError extends Error {
  readonly signal: DoctorTerminationSignal;

  constructor(signal: DoctorTerminationSignal) {
    super(`Relay doctor interrupted by ${signal}.`);
    this.name = 'DoctorInterruptedError';
    this.signal = signal;
  }
}

export function doctorSignalExitCode(signal: DoctorTerminationSignal): 130 | 143 {
  return signal === 'SIGINT' ? 130 : 143;
}
```

The error message is for internal diagnosis only and must not be serialized into doctor output.

### Signal handler contract

Replace the current fire-and-forget handler with this contract:

```ts
export interface DoctorSignalRegistration {
  readonly getSignal: () => DoctorTerminationSignal | undefined;
  readonly cleanupStarted: () => Promise<void>;
  readonly remove: () => void;
}

export function installDoctorSignalHandlers(input: {
  readonly controller: AbortController;
}): DoctorSignalRegistration;
```

Required behavior:

1. Register one handler for `SIGINT` and one for `SIGTERM`.
2. On the first signal, store it, call `controller.abort(new DoctorInterruptedError(signal))`, and start `cleanupDoctorChildren()` exactly once.
3. Ignore subsequent signals for state selection and cleanup scheduling.
4. `cleanupStarted()` resolves after signal-triggered cleanup, or immediately if no signal was received.
5. `remove()` unregisters both handlers and is safe to call once from `finally`.

### Doctor runner contract

Extend `runDoctor()` with an abort signal:

```ts
export async function runDoctor(input: {
  readonly context: DoctorCheckContext;
  readonly checks: readonly DoctorCheck[];
  readonly signal?: AbortSignal;
}): Promise<DoctorReport>;
```

Before starting each check and immediately after each check resolves or rejects, call a helper equivalent to:

```ts
function throwIfDoctorAborted(signal: AbortSignal | undefined): void {
  if (!signal?.aborted) return;
  const reason = signal.reason;
  if (reason instanceof DoctorInterruptedError) throw reason;
  throw new DoctorInterruptedError('SIGTERM');
}
```

Do not convert `DoctorInterruptedError` into a normal `*.internal-error` check result. Only non-interruption check errors retain the existing sanitization behavior.

### Cleanup registration

Keep `registerDoctorCleanup(cleanup)` as the shared registration API, but make each registration once-only:

```ts
export function registerDoctorCleanup(cleanup: () => Promise<void> | void): () => void;
```

The returned unregister function removes the action only if it has not started. The registered action must execute at most once even when signal cleanup and a check's `finally` race.

Add a helper for disposable roots:

```ts
export interface DoctorTemporaryRoot {
  readonly path: string;
  cleanup(): Promise<void>;
}

export function registerDoctorTemporaryRoot(root: DoctorTemporaryRoot): {
  readonly cleanup: () => Promise<void>;
};
```

`cleanup()` invokes the same once-only registered action and unregisters it after completion. MCP and UI checks must call this immediately after `temporaryRootFactory()` resolves.

---

### Task 1: Add typed interruption and make ordered execution abort-aware

**Files:**

- Create: `src/distribution/doctor/doctor-interruption.ts`
- Modify: `src/distribution/doctor/run-doctor.ts`
- Modify: `tests/unit/distribution/doctor/run-doctor.test.ts`

**Interfaces:**

- Produces: `DoctorTerminationSignal`, `DoctorInterruptedError`, and `doctorSignalExitCode()`.
- Modifies: `runDoctor({ context, checks, signal? })`.
- Preserves: all normal report generation and sanitization behavior.

- [ ] **Step 1: Write failing tests for interruption before the first check.**

Add a test that creates an already-aborted controller:

```ts
const controller = new AbortController();
controller.abort(new DoctorInterruptedError('SIGINT'));
const calls: DoctorCheckId[] = [];
const checks = checksFor(healthyResults).map((check) => ({
  id: check.id,
  run: async () => {
    calls.push(check.id);
    return check.run();
  },
}));

await expect(runDoctor({ context, checks, signal: controller.signal })).rejects.toMatchObject({
  name: 'DoctorInterruptedError',
  signal: 'SIGINT',
});
expect(calls).toEqual([]);
```

Use the existing deterministic `context` and helper style in `run-doctor.test.ts`; do not duplicate the full check-order fixture unnecessarily.

- [ ] **Step 2: Write a failing test that interruption after one check prevents the next check.**

Use a controller and make the first check abort it before returning:

```ts
const calls: DoctorCheckId[] = [];
const checks = checksFor(healthyResults).map((check, index) => ({
  id: check.id,
  run: async () => {
    calls.push(check.id);
    if (index === 0) controller.abort(new DoctorInterruptedError('SIGTERM'));
    return check.run();
  },
}));

await expect(runDoctor({ context, checks, signal: controller.signal })).rejects.toMatchObject({
  signal: 'SIGTERM',
});
expect(calls).toEqual([DOCTOR_CHECK_ORDER[0]]);
```

This test locks the post-check abort boundary. Without it, the runner could append the result and start check two.

- [ ] **Step 3: Write a failing test that a check throwing `DoctorInterruptedError` is not sanitized.**

Make one check throw `new DoctorInterruptedError('SIGINT')` and assert `runDoctor()` rejects with that exact typed interruption instead of returning `<check-id>.internal-error`.

- [ ] **Step 4: Run the focused test and verify failure.**

```bash
pnpm test -- tests/unit/distribution/doctor/run-doctor.test.ts
```

Expected: FAIL because `runDoctor()` has no abort contract and interruption is currently sanitized.

- [ ] **Step 5: Implement `doctor-interruption.ts`.**

Implement exactly the types and exit-code function defined above. Do not add a generic cancellation framework, signal aliases, mutable status object, or output formatting here.

- [ ] **Step 6: Make `runDoctor()` check interruption boundaries.**

Implementation rules:

1. Keep `assertCheckOrder()` first so programmer contract errors remain visible in tests.
2. Call `throwIfDoctorAborted(input.signal)` before entering the loop.
3. Call it immediately before every `check.run()`.
4. In the `catch`, rethrow `DoctorInterruptedError`; sanitize all other errors exactly as today.
5. Call it again after the check result/catch path but before the next iteration.
6. Do not build or return a partial report after interruption.

- [ ] **Step 7: Run focused tests and type checking.**

```bash
pnpm test -- tests/unit/distribution/doctor/run-doctor.test.ts
pnpm typecheck
```

Expected: PASS.

- [ ] **Step 8: Commit the abort-aware runner.**

```bash
git add src/distribution/doctor/doctor-interruption.ts src/distribution/doctor/run-doctor.ts tests/unit/distribution/doctor/run-doctor.test.ts
git commit -m "fix: stop doctor checks after interruption"
```

---

### Task 2: Make signal handling coordinated and cleanup once-only

**Files:**

- Modify: `src/distribution/doctor/child-process-probe.ts`
- Modify: `tests/unit/distribution/doctor/child-process-probe.test.ts`

**Interfaces:**

- Consumes: `DoctorInterruptedError` and `DoctorTerminationSignal`.
- Produces: `DoctorSignalRegistration` and `installDoctorSignalHandlers({ controller })`.
- Produces: once-only cleanup behavior and `registerDoctorTemporaryRoot()`.
- Preserves: `runChildProcessProbe()`, timeout constants, bounded capture, process-tree termination, and `cleanupDoctorChildren()`.

- [ ] **Step 1: Add a test-only signal-listener target without signaling the Vitest process.**

Do not call `process.emit('SIGINT')` or send an OS signal to the Vitest worker. Refactor the handler installer to accept an internal event target only for tests:

```ts
interface DoctorSignalTarget {
  on(signal: DoctorTerminationSignal, listener: () => void): unknown;
  off(signal: DoctorTerminationSignal, listener: () => void): unknown;
}
```

The public input may include an optional `signalTarget`, defaulting to `process`:

```ts
export function installDoctorSignalHandlers(input: {
  readonly controller: AbortController;
  readonly signalTarget?: DoctorSignalTarget;
}): DoctorSignalRegistration;
```

Keep `DoctorSignalTarget` module-private unless tests require a structural type import.

- [ ] **Step 2: Write failing unit tests for signal registration.**

Use a small fake target that stores listeners by signal. Assert:

1. emitting `SIGINT` aborts the controller with `DoctorInterruptedError('SIGINT')`;
2. `getSignal()` returns `SIGINT`;
3. `cleanupStarted()` waits for an async registered cleanup;
4. a later emitted `SIGTERM` does not replace the selected signal;
5. the registered cleanup ran exactly once;
6. `remove()` removes both listeners.

- [ ] **Step 3: Write a failing race test for once-only cleanup.**

Register one deferred cleanup, invoke `cleanupDoctorChildren()` twice concurrently, then invoke the cleanup returned by `registerDoctorTemporaryRoot()` or equivalent. Resolve the deferred cleanup and assert the underlying action ran exactly once and every caller resolved.

Reset module-level cleanup state in `afterEach` by awaiting `cleanupDoctorChildren()` so tests cannot contaminate one another.

- [ ] **Step 4: Run the focused tests and verify failure.**

```bash
pnpm test -- tests/unit/distribution/doctor/child-process-probe.test.ts
```

Expected: FAIL because the existing signal handler has no abort state, no awaited cleanup promise, and cleanup registrations are not once-only.

- [ ] **Step 5: Wrap every registered cleanup in one shared promise.**

Each registry entry should have conceptual state:

```ts
interface RegisteredCleanup {
  started: boolean;
  promise?: Promise<void>;
  run(): Promise<void>;
}
```

`run()` must create and cache one promise. Convert synchronous throws into rejected promises. `cleanupDoctorChildren()` should use `Promise.allSettled()` over active child termination and registered cleanup actions so one cleanup failure does not prevent the rest. It may then resolve without surfacing individual cleanup details because doctor output must stay sanitized.

Do not clear registry entries before their `run()` promises settle. Remove them in a `finally` attached to the cached promise.

- [ ] **Step 6: Implement the signal registration contract.**

Use local state inside one installation:

```ts
let receivedSignal: DoctorTerminationSignal | undefined;
let signalCleanup: Promise<void> | undefined;
```

On first signal:

```ts
receivedSignal = signal;
input.controller.abort(new DoctorInterruptedError(signal));
signalCleanup = cleanupDoctorChildren();
```

`cleanupStarted()` returns `signalCleanup ?? Promise.resolve()`.

Do not write output, set `process.exitCode`, call `process.exit()`, throw from the event handler, or install `once` listeners that make `remove()` ambiguous.

- [ ] **Step 7: Implement `registerDoctorTemporaryRoot()`.**

It must register `root.cleanup` immediately and expose one `cleanup()` function used by check `finally` blocks. Both signal cleanup and normal cleanup call the same once-only registration.

- [ ] **Step 8: Preserve child-process timeout behavior.**

`runChildProcessProbe()` may continue registering `terminateChild(child)`, but route it through the once-only registry. Confirm timeout, spawn-callback failure, bounded capture, and grandchild termination tests remain unchanged and pass.

- [ ] **Step 9: Run focused tests and type checking.**

```bash
pnpm test -- tests/unit/distribution/doctor/child-process-probe.test.ts
pnpm typecheck
```

Expected: PASS.

- [ ] **Step 10: Commit coordinated cleanup and signal state.**

```bash
git add src/distribution/doctor/child-process-probe.ts tests/unit/distribution/doctor/child-process-probe.test.ts
git commit -m "fix: coordinate doctor signal cleanup"
```

---

### Task 3: Return interrupted exit codes and suppress reports

**Files:**

- Modify: `src/interfaces/cli/run-doctor-command.ts`
- Modify: `tests/unit/interfaces/cli/doctor-command.test.ts`

**Interfaces:**

- Consumes: `installDoctorSignalHandlers({ controller })`, `DoctorInterruptedError`, and `doctorSignalExitCode()`.
- Passes: `controller.signal` to `runDoctor()`.
- Produces: exit `130` for `SIGINT`, `143` for `SIGTERM`, and no report after interruption.

- [ ] **Step 1: Extend the command test harness with a fake signal target.**

If `runDoctorCommand()` currently imports the concrete installer directly, add injectable lifecycle dependencies rather than mocking module globals:

```ts
export interface DoctorCommandDependencies {
  // existing fields
  readonly installSignalHandlers?: typeof installDoctorSignalHandlers;
}
```

Production defaults to `installDoctorSignalHandlers`. Tests inject an installer that captures the controller and returns a deterministic registration object. Do not expose the fake target through production dependency construction.

- [ ] **Step 2: Write a failing SIGINT command test.**

Create a first check that waits on a deferred promise. Start `runDoctorCommand()`, abort the captured controller with `DoctorInterruptedError('SIGINT')`, resolve the check, and assert:

```ts
expect(await commandPromise).toBe(130);
expect(stdout).toBe('');
expect(stderr).toBe('');
expect(startedCheckIds).toEqual([DOCTOR_CHECK_ORDER[0]]);
expect(cleanupStarted).toHaveBeenAwaited();
expect(removeHandlers).toHaveBeenCalledTimes(1);
```

Do not expect a partial JSON document or interruption diagnostic on stderr. Ctrl+C semantics are represented by the exit code.

- [ ] **Step 3: Write the equivalent failing SIGTERM test.**

Assert exit `143` and no completed report.

- [ ] **Step 4: Write a regression test for normal execution.**

Assert a healthy report still writes once, exits `0`, awaits final cleanup, and removes handlers. Keep the existing warning/failure/usage tests unchanged.

- [ ] **Step 5: Run focused tests and verify failure.**

```bash
pnpm test -- tests/unit/interfaces/cli/doctor-command.test.ts
```

Expected: FAIL because the command does not own an abort controller or interrupted exit mapping.

- [ ] **Step 6: Implement command-scoped lifecycle coordination.**

Use this sequence exactly:

```ts
const controller = new AbortController();
const registration = install({ controller });
try {
  const report = await runDoctor({ ..., signal: controller.signal });
  writeDoctorReport(...);
  return report.summary.failure > 0 ? 1 : 0;
} catch (error) {
  if (error instanceof DoctorInterruptedError) {
    await registration.cleanupStarted();
    return doctorSignalExitCode(error.signal);
  }
  dependencies.stderr.write('The doctor command could not complete safely.\n');
  return 1;
} finally {
  await cleanupDoctorChildren();
  await registration.cleanupStarted();
  registration.remove();
}
```

Important ordering:

1. no `writeDoctorReport()` before `runDoctor()` completes;
2. interruption is handled separately from internal failure;
3. final cleanup is awaited before returning the exit code;
4. handlers are removed after cleanup;
5. the normal report is emitted only after the full ordered run succeeds.

Avoid returning from `finally`, which would mask exit codes and errors.

- [ ] **Step 7: Run command tests, runner tests, and type checking.**

```bash
pnpm test -- tests/unit/interfaces/cli/doctor-command.test.ts tests/unit/distribution/doctor/run-doctor.test.ts tests/unit/distribution/doctor/child-process-probe.test.ts
pnpm typecheck
```

Expected: PASS.

- [ ] **Step 8: Commit interrupted command semantics.**

```bash
git add src/interfaces/cli/run-doctor-command.ts tests/unit/interfaces/cli/doctor-command.test.ts
git commit -m "fix: return doctor signal exit codes"
```

---

### Task 4: Register MCP/UI temporary roots with signal cleanup

**Files:**

- Modify: `src/distribution/doctor/check-mcp.ts`
- Modify: `src/distribution/doctor/check-ui.ts`
- Modify: `tests/unit/distribution/doctor/check-mcp.test.ts`
- Modify: `tests/unit/distribution/doctor/check-ui.test.ts`

**Interfaces:**

- Consumes: `registerDoctorTemporaryRoot(root)`.
- Preserves: isolated `RELAY_DB_PATH`, MCP tool discovery, UI loopback validation, timeouts, and stable diagnostic codes.

- [ ] **Step 1: Write failing MCP cleanup-race tests.**

Use an injected temporary-root fixture whose underlying cleanup increments a counter and waits on a deferred promise. Start the MCP check with a hanging transport/probe, call `cleanupDoctorChildren()`, release the deferred cleanup, let the check finish, and assert root cleanup ran exactly once.

Also assert the real configured database path is never passed to the probe environment.

- [ ] **Step 2: Write failing UI cleanup-race tests.**

Use the same once-only root fixture. Start a UI probe that waits for readiness, trigger `cleanupDoctorChildren()`, and assert:

- the child probe is terminated;
- root cleanup runs once;
- the check resolves to its existing sanitized failure code;
- no subsequent cleanup throws or logs the temporary path.

- [ ] **Step 3: Run focused tests and verify failure.**

```bash
pnpm test -- tests/unit/distribution/doctor/check-mcp.test.ts tests/unit/distribution/doctor/check-ui.test.ts
```

Expected: FAIL because roots are currently cleaned only by local `finally` blocks and are absent from signal cleanup.

- [ ] **Step 4: Register roots immediately after allocation.**

For both checks:

```ts
const root = await input.temporaryRootFactory();
const registeredRoot = registerDoctorTemporaryRoot(root);
```

Replace `await root.cleanup()` in `finally` with:

```ts
await registeredRoot.cleanup();
```

Do not delay registration until after spawning a child. A signal can arrive between root creation and child creation.

- [ ] **Step 5: Keep transport/probe cleanup ordering safe.**

For MCP, close client and transport before awaiting root cleanup during normal execution. Signal cleanup may run concurrently, so all operations must tolerate already-closed transports and an already-removed root.

For UI, terminate/await the probe before local root cleanup. Keep `cleanupDoctorChildren()` in `finally` only if needed for current child semantics; it must be safe and once-only after Task 2.

- [ ] **Step 6: Run focused doctor tests.**

```bash
pnpm test -- tests/unit/distribution/doctor/check-mcp.test.ts tests/unit/distribution/doctor/check-ui.test.ts tests/unit/distribution/doctor/child-process-probe.test.ts
pnpm typecheck
```

Expected: PASS.

- [ ] **Step 7: Commit temporary-root signal cleanup.**

```bash
git add src/distribution/doctor/check-mcp.ts src/distribution/doctor/check-ui.ts tests/unit/distribution/doctor/check-mcp.test.ts tests/unit/distribution/doctor/check-ui.test.ts
git commit -m "fix: clean doctor temporary roots on signal"
```

---

### Task 5: Add process-level SIGINT and SIGTERM regression coverage

**Files:**

- Create: `tests/fixtures/doctor/process/signal-doctor-child.mjs` only if the real built CLI cannot be made deterministic through existing injection hooks; otherwise do not create it.
- Modify: `tests/integration/doctor-installed-package.test.ts`
- Modify: `scripts/package/smoke-installed-package.ts` only if the existing package-smoke helper can safely run signal cases without making normal `pnpm verify` flaky.
- Modify: `docs/doctor.md`

**Interfaces:**

- Exercises: the built or installed `relay doctor` executable, not `runDoctorCommand()` directly.
- Verifies: exit codes, no report, timely exit, descendant cleanup, and temporary-root removal.

- [ ] **Step 1: Add a deterministic test-only probe delay hook.**

Do not add a public CLI flag. Use one test-only environment variable consumed only by doctor probe construction, for example:

```text
RELAY_DOCTOR_TEST_HOLD_PROBE=mcp
```

Rules:

- accepted only when `NODE_ENV === 'test'` or an existing package-smoke test marker is present;
- never documented as a user feature;
- causes the selected isolated probe to remain active long enough for the parent test to send a signal;
- does not touch the configured database or client files;
- must not weaken production timeouts when the variable is absent.

Prefer an existing injected fixture/hook if one already exists after Luna inspects the current integration tests. Do not add sockets, IPC servers, or polling files unless necessary.

- [ ] **Step 2: Write a process helper in the integration test.**

The helper must:

1. install/build the tarball using the existing installed-package fixture;
2. create an isolated home/data/config/cache/database environment;
3. snapshot the system temp directory for `.relay-doctor-*` entries owned by this test or direct the test environment to a dedicated temporary parent if supported;
4. spawn the installed `relay doctor --output json` command;
5. wait until the selected MCP or UI probe is known to be active using deterministic fixture output or the test hook;
6. send `SIGINT` or `SIGTERM` to the doctor parent process;
7. wait with a bounded timeout for process exit;
8. inspect exit code, stdout, descendants, and temporary roots.

Do not use fixed sleeps as readiness proof. A short bounded polling loop is acceptable only for a deterministic file/process marker created under the test's temporary directory.

- [ ] **Step 3: Add the SIGINT case.**

Assert:

```text
exit code = 130
stdout = empty
stderr contains no stack trace, SQL, environment values, or temporary path
no descendant process remains
no doctor temporary root remains
configured database bytes and mtime unchanged
ownership metadata bytes and mtime unchanged
```

If the operating system reports signal termination instead of a numeric code despite the locked command behavior, treat that as failure; the implementation is expected to return `130` after awaited cleanup.

- [ ] **Step 4: Add the SIGTERM case.**

Repeat the same assertions with exit code `143`.

- [ ] **Step 5: Add a no-later-probe assertion.**

Interrupt during MCP and assert the UI probe marker was never created. This proves `runDoctor()` did not continue to check 14 after signal handling.

- [ ] **Step 6: Run installed doctor integration tests repeatedly.**

```bash
pnpm build
pnpm test -- tests/integration/doctor-installed-package.test.ts
pnpm test -- tests/integration/doctor-installed-package.test.ts
pnpm test -- tests/integration/doctor-installed-package.test.ts
```

Expected: all runs PASS without leaked children or roots. Repetition is intentional to expose cleanup races.

- [ ] **Step 7: Update doctor documentation.**

Add one concise paragraph:

```text
Ctrl+C and SIGTERM stop the diagnostic run, clean up active probes and temporary roots, and do not emit a completed report. Interrupted runs return 130 for SIGINT and 143 for SIGTERM.
```

Do not expose test hooks or internal cleanup implementation.

- [ ] **Step 8: Commit process-level coverage and documentation.**

```bash
git add tests/integration/doctor-installed-package.test.ts tests/fixtures/doctor/process scripts/package/smoke-installed-package.ts docs/doctor.md
git commit -m "test: verify doctor signal termination"
```

Only add paths that actually changed.

---

### Task 6: Full regression and human verification

**Files:**

- Modify: PR description only if validation results or behavior summary need correction.
- No production code changes unless a failing gate identifies a real defect.

- [ ] **Step 1: Run all focused doctor tests.**

```bash
pnpm test -- tests/unit/distribution/doctor tests/unit/interfaces/cli/doctor-command.test.ts tests/unit/interfaces/cli/run-relay.test.ts tests/integration/doctor-installed-package.test.ts
```

Expected: PASS.

- [ ] **Step 2: Run static and formatting gates.**

```bash
pnpm format:check
pnpm lint
pnpm typecheck
```

Expected: PASS with zero warnings.

- [ ] **Step 3: Run the complete project gate.**

```bash
pnpm verify
```

Expected: PASS except for the already-documented external registry/audit restriction if the execution environment blocks network access. Do not attribute unrelated known advisories to this remediation.

- [ ] **Step 4: Run installed package verification.**

```bash
RELAY_RUN_PACKAGE_SMOKE=1 pnpm verify:package
```

Expected: installed doctor, MCP, UI, arbitrary-CWD, signal cleanup, and package asset checks PASS.

- [ ] **Step 5: Perform the human signal gate with an isolated tarball.**

For both `SIGINT` and `SIGTERM`:

1. install the tarball in a disposable prefix;
2. configure isolated `HOME`, data/config/cache roots, and `RELAY_DB_PATH`;
3. start `relay doctor --output json` while the MCP/UI probe is active;
4. send the signal;
5. verify exit `130`/`143`;
6. verify stdout contains no complete JSON report;
7. verify no `relay mcp`, `relay ui`, or descendant process remains;
8. verify no `.relay-doctor-*` temporary root remains;
9. verify the configured database, ownership metadata, and client fixtures are byte-for-byte unchanged.

- [ ] **Step 6: Record verification in the PR.**

Add a PR comment containing:

- head commit SHA;
- focused test commands;
- complete gate result;
- installed package result;
- SIGINT result and exit code;
- SIGTERM result and exit code;
- confirmation that MCP interruption prevented UI startup;
- confirmation of no leaked descendants or temporary roots;
- confirmation that configured state remained unchanged.

- [ ] **Step 7: Request re-review.**

Reply to review thread `discussion_r3712638732` with the remediation commit SHA and the exact process-level test names. Do not resolve the thread before the updated code and tests are pushed.

---

## AI Implementation Guidance

### Decisions already made

- Use command-scoped `AbortController` cancellation.
- Use typed `DoctorInterruptedError` control flow.
- Return `130` for `SIGINT` and `143` for `SIGTERM`.
- Do not emit a complete report after interruption.
- Stop starting checks after cancellation.
- Await child and temporary-root cleanup before returning.
- Keep cleanup once-only and safe under concurrent signal/local-finally calls.
- Add unit tests and real process-level installed-command tests.

### Decisions Luna may make

- Exact names of private helper functions and private registry-entry types.
- Whether the integration test uses an existing test hook or adds one narrowly scoped environment hook.
- Minor fixture organization consistent with current test conventions.
- Whether process-level signal cases live in one parameterized test or two explicit tests, provided failures identify the signal clearly.

### Decisions Luna must not make

- Do not change doctor report schema, check order, statuses, diagnostic codes, or normal exit codes.
- Do not print partial JSON or synthesize a 14-check interrupted report.
- Do not call `process.exit()` from doctor modules.
- Do not leave signal handlers installed after command completion.
- Do not rely on fixed sleeps as the primary readiness mechanism.
- Do not clean the real database or client configuration.
- Do not introduce a general job scheduler, event bus, worker framework, external process library, or new runtime dependency.
- Do not treat cleanup failures as permission to skip other cleanups.
- Do not resolve the review thread without process-level evidence.

### Human review checkpoints

1. After Task 2, inspect that signal callbacks only abort and schedule shared cleanup; they do not exit or print.
2. After Task 3, verify report writing occurs only on the non-interrupted path.
3. After Task 4, verify roots are registered immediately after allocation.
4. After Task 5, inspect tests for deterministic readiness and assertions against leaked descendants.
5. Before merge, run the isolated manual SIGINT/SIGTERM gate.

## Self-Review Checklist

- [ ] The plan fixes the exact review finding rather than redesigning doctor.
- [ ] The first signal wins and cleanup starts once.
- [ ] Current probes terminate and later probes do not start.
- [ ] Temporary roots participate in signal cleanup.
- [ ] Cleanup is awaited before exit-code return.
- [ ] Interrupted runs produce no completed report.
- [ ] Exit codes are explicitly locked to `130` and `143`.
- [ ] Unit and real process-level tests cover both signals.
- [ ] Normal healthy, warning, failure, timeout, and cleanup paths remain covered.
- [ ] No new runtime dependency or public CLI option is introduced.
