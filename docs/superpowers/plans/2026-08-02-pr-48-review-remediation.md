# PR #48 Review Remediation Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Correct PR #48 so concurrent setup operations cannot lose ownership records, rollback restores a previously absent client configuration to absence, and the operational command tests pass on every supported host platform.

**Architecture:** Keep the existing setup adapters, client-file fingerprint checks, backup pipeline, ownership JSON format, CLI contract, and public commands unchanged. Add one process-safe ownership-metadata mutation boundary that serializes the read-modify-write sequence, carry original-file existence through the backup result so rollback can restore the exact pre-operation state, and make CLI parser tests generate host-native absolute paths instead of embedding Windows-only paths.

**Tech Stack:** Node.js 24 (`>=24 <25`), TypeScript/ESM, Node filesystem primitives, Vitest, existing Relay setup/configuration modules.

## Global Constraints

- Do not change the public `relay setup` or `relay config` command grammar.
- Do not change ownership metadata schema version `1` or add speculative metadata fields.
- Do not move ownership state into SQLite; `config.json` remains authoritative.
- Do not weaken client-file fingerprint checks, backup-before-mutation, parse validation, atomic replacement, or task-data retention.
- Concurrent operations must either serialize safely or fail with an actionable conflict; they must never silently overwrite another integration record.
- The ownership lock must be package-independent and use only Node.js filesystem primitives; do not add a locking dependency.
- Lock acquisition must not scan the filesystem or infer other client paths.
- A failed metadata write after creating a previously absent client file must remove that new file during rollback.
- A failed metadata write after modifying an existing client file must restore the exact backup and preserve its mode.
- Backups remain retained after failure.
- Tests must use temporary directories and must not touch real user configuration or default Relay paths.
- `pnpm verify` and `RELAY_RUN_PACKAGE_SMOKE=1 pnpm verify:package` must pass before the PR is ready.

---

## Locked Remediation Design

### Ownership mutation serialization

Add a lock file beside Relay ownership metadata:

```text
<config-root>/config.json.relay-lock
```

The lock is acquired with `open(lockPath, 'wx', 0o600)`. `wx` is the cross-process exclusion primitive: exactly one process may create the lock file.

Use these exact constants:

```ts
const OWNERSHIP_LOCK_RETRY_DELAY_MS = 25;
const OWNERSHIP_LOCK_MAX_ATTEMPTS = 40;
```

This gives other short-lived Relay operations up to approximately one second to finish. On every `EEXIST`, wait 25 ms and retry. After 40 unsuccessful attempts, throw `SetupConflictError` with an actionable message that another Relay configuration operation is in progress and the user should retry. Do not automatically delete or break an existing lock because Relay cannot prove that its owner is dead.

The process that acquires the lock must close and unlink it in `finally`. The lock must cover the complete ownership read-modify-write operation, not merely the final rename.

Expose one mutation API so callers cannot accidentally reintroduce an unlocked read/write pair:

```ts
export interface OwnershipStore {
  read(): Promise<RelayOwnershipFile>;
  update(mutate: (current: RelayOwnershipFile) => RelayOwnershipFile): Promise<RelayOwnershipFile>;
}
```

`update()` must:

1. acquire the lock;
2. read and validate the latest metadata while holding the lock;
3. call `mutate(current)` exactly once;
4. validate and atomically write the returned value;
5. return the persisted value;
6. release the lock in `finally`.

Remove the public `write()` method after all tests and callers migrate. Tests may use `update(() => fixture)` to seed metadata.

### Exact rollback state

Change the backup result to record whether the target existed before mutation:

```ts
export interface BackupAndAtomicWriteResult {
  readonly backupPath: string;
  readonly originalExisted: boolean;
  readonly originalMode: number;
}
```

Add one restoration function:

```ts
export async function restoreOriginalFile(input: {
  readonly backupPath: string;
  readonly targetPath: string;
  readonly originalExisted: boolean;
  readonly originalMode: number;
}): Promise<void>;
```

Behavior:

- `originalExisted: true`: restore backup contents atomically and apply `originalMode`.
- `originalExisted: false`: unlink the newly created target; treat `ENOENT` as success.
- Never delete the backup.

Use this function both for post-replacement validation failure inside `backupAndAtomicWrite()` and metadata-persistence failure inside `applyIntegrationChange()`.

---

### Task 1: Make operational parser tests host-independent and restore green CI

**Files:**

- Modify: `tests/unit/interfaces/cli/operational-commands.test.ts`

**Interfaces:**

- Consumes: existing `parseOperationalCommand(argv)` behavior.
- Produces: the same assertions using an absolute path valid on the current test host.

- [ ] **Step 1: Replace hard-coded Windows paths with a host-native absolute fixture path.**

At the top of the test file import `resolve`:

```ts
import { resolve } from 'node:path';
```

Inside the suite define:

```ts
const absoluteConfigPath = resolve('tmp', 'codex.toml');
```

Use `absoluteConfigPath` in every test case intended to represent a valid absolute path. Keep `relative.toml` for the negative relative-path case.

The successful assertion must be:

```ts
expect(
  parseOperationalCommand([
    'setup',
    '--client',
    'codex',
    '--config-file',
    absoluteConfigPath,
    '--apply',
  ]),
).toEqual({
  kind: 'setup',
  client: 'codex',
  configFile: absoluteConfigPath,
  apply: true,
});
```

- [ ] **Step 2: Run the previously failing test.**

```bash
pnpm test -- tests/unit/interfaces/cli/operational-commands.test.ts
```

Expected: all three tests pass on the current host.

- [ ] **Step 3: Commit the portable test fix.**

```bash
git add tests/unit/interfaces/cli/operational-commands.test.ts
git commit -m "test: use host-native setup config paths"
```

---

### Task 2: Serialize ownership metadata read-modify-write operations

**Files:**

- Modify: `src/distribution/setup/ownership-store.ts`
- Modify: `src/distribution/setup/apply-integration-change.ts`
- Modify: `tests/unit/distribution/setup/ownership-store.test.ts`
- Modify: `tests/unit/distribution/setup/apply-integration-change.test.ts`
- Modify: any test currently calling `ownershipStore.write(...)`

**Interfaces:**

- Produces:

```ts
export interface OwnershipStore {
  read(): Promise<RelayOwnershipFile>;
  update(mutate: (current: RelayOwnershipFile) => RelayOwnershipFile): Promise<RelayOwnershipFile>;
}
```

- Internal helper:

```ts
async function withOwnershipLock<T>(metadataPath: string, action: () => Promise<T>): Promise<T>;
```

- [ ] **Step 1: Write a failing concurrent-update test.**

Add a test to `ownership-store.test.ts` using two store instances pointing to the same temporary `config.json`:

```ts
it('preserves both records when independent stores update concurrently', async () => {
  const first = createOwnershipStore({ metadataPath, applicationVersion: '0.1.0' });
  const second = createOwnershipStore({ metadataPath, applicationVersion: '0.1.0' });

  await Promise.all([
    first.update((current) => ({
      schemaVersion: 1,
      integrations: [...current.integrations, codexRecord],
    })),
    second.update((current) => ({
      schemaVersion: 1,
      integrations: [...current.integrations, claudeRecord],
    })),
  ]);

  await expect(first.read()).resolves.toMatchObject({
    integrations: [
      expect.objectContaining({ client: 'claude-code' }),
      expect.objectContaining({ client: 'codex' }),
    ],
  });
});
```

Use different absolute config paths for the two records. Do not mock the lock; this test must exercise real cross-instance filesystem exclusion.

- [ ] **Step 2: Write a failing lock-timeout test.**

Create `<metadataPath>.relay-lock` before calling `update()`. Assert rejection is `SetupConflictError` and the message includes both `in progress` and `retry`. Remove the fixture lock in `finally`.

Use fake timers only if necessary. Prefer injecting these optional internal timing dependencies into `createOwnershipStore`:

```ts
readonly lockRetryDelayMs?: number;
readonly lockMaxAttempts?: number;
readonly sleep?: (milliseconds: number) => Promise<void>;
```

Production defaults must remain 25 ms and 40 attempts. The timeout test may use `lockRetryDelayMs: 0`, `lockMaxAttempts: 2`, and `sleep: async () => undefined`.

- [ ] **Step 3: Run ownership tests and confirm the new tests fail.**

```bash
pnpm test -- tests/unit/distribution/setup/ownership-store.test.ts
```

Expected: FAIL because `update()` and locking do not exist.

- [ ] **Step 4: Implement `withOwnershipLock()`.**

Use `open(lockPath, 'wx', 0o600)`. After acquisition, write a minimal diagnostic payload containing only PID and acquisition timestamp:

```ts
await handle.writeFile(
  `${JSON.stringify({ pid: process.pid, acquiredAt: new Date().toISOString() })}\n`,
  'utf8',
);
await handle.sync();
```

Do not print the payload. In `finally`, close the handle and unlink the lock path. If lock cleanup fails, wrap it as `SetupStorageError`; do not report success while the lock remains unexpectedly.

On `EEXIST`, retry. After the maximum attempts, throw:

```ts
new SetupConflictError(
  `Another Relay configuration operation is in progress for ${metadataPath}. Retry after it completes.`,
);
```

Other open/write/close/unlink errors map to `SetupStorageError` and name only the metadata or lock path.

- [ ] **Step 5: Implement `OwnershipStore.update()` and make raw writing private.**

Refactor existing write logic into a private `writeValidatedOwnership(next)` closure. `update()` executes this exact sequence while holding the lock:

```ts
return withOwnershipLock(input.metadataPath, async () => {
  const current = await readOwnership();
  const next = mutate(current);
  await writeValidatedOwnership(next);
  return validateOwnership(next, input.applicationVersion);
});
```

Keep `read()` lock-free because inspection is read-only and atomic replacement prevents partial JSON reads.

Remove `write()` from the exported interface. Do not expose the lock helper.

- [ ] **Step 6: Update `applyIntegrationChange()` to merge against the latest metadata under lock.**

Replace this unsafe sequence:

```ts
const ownership = await input.ownershipStore.read();
// calculate existing
await input.ownershipStore.write(next);
```

with:

```ts
await input.ownershipStore.update((ownership) => {
  const existing = ownership.integrations.filter(
    (record) =>
      !(
        record.client === input.plan.client &&
        sameOwnedPath(record.configPath, input.plan.configPath)
      ),
  );
  return {
    schemaVersion: 1,
    integrations: input.plan.operation === 'removed' ? existing : [...existing, nextRecord],
  };
});
```

Add or reuse one path-comparison helper with native Windows case-insensitive behavior. Do not compare ownership paths using raw string equality.

- [ ] **Step 7: Migrate test setup from `write()` to `update()`.**

For fixture seeding use:

```ts
await ownershipStore.update(() => fixtureOwnership);
```

Do not add a test-only public write bypass.

- [ ] **Step 8: Add an `applyIntegrationChange` concurrency regression test.**

Create two client files and two plans from the same initial empty ownership snapshot. Run the two `applyIntegrationChange()` calls concurrently with separate adapters and the same metadata path. Assert:

- both client files contain their Relay entry;
- final ownership metadata contains both records;
- neither operation reports success with a missing ownership record.

Use Codex for one operation and Claude Code for the other so the regression matches the real failure mode.

- [ ] **Step 9: Run focused setup tests.**

```bash
pnpm test -- \
  tests/unit/distribution/setup/ownership-store.test.ts \
  tests/unit/distribution/setup/apply-integration-change.test.ts \
  tests/integration/setup-workflow.test.ts
pnpm typecheck
```

Expected: all pass.

- [ ] **Step 10: Commit ownership serialization.**

```bash
git add \
  src/distribution/setup/ownership-store.ts \
  src/distribution/setup/apply-integration-change.ts \
  tests/unit/distribution/setup \
  tests/integration/setup-workflow.test.ts
git commit -m "fix: serialize Relay ownership metadata updates"
```

---

### Task 3: Restore exact pre-write absence after metadata failure

**Files:**

- Modify: `src/distribution/setup/backup-and-atomic-write.ts`
- Modify: `src/distribution/setup/apply-integration-change.ts`
- Modify: `tests/unit/distribution/setup/backup-and-atomic-write.test.ts`
- Modify: `tests/unit/distribution/setup/apply-integration-change.test.ts`

**Interfaces:**

- Produces:

```ts
export interface BackupAndAtomicWriteResult {
  readonly backupPath: string;
  readonly originalExisted: boolean;
  readonly originalMode: number;
}

export async function restoreOriginalFile(input: {
  readonly backupPath: string;
  readonly targetPath: string;
  readonly originalExisted: boolean;
  readonly originalMode: number;
}): Promise<void>;
```

- [ ] **Step 1: Write a failing low-level rollback test for a missing original file.**

In `backup-and-atomic-write.test.ts`:

1. choose a target path that does not exist;
2. call `backupAndAtomicWrite()` with the empty-content fingerprint and valid next content;
3. assert the target now exists;
4. call `restoreOriginalFile(result)`;
5. assert the target does not exist;
6. assert the backup still exists and contains zero bytes.

Use `existsSync()` only for assertions; production remains async.

- [ ] **Step 2: Write a failing application-level metadata failure test.**

In `apply-integration-change.test.ts`, create a plan for a nonexistent Codex config. Supply an `OwnershipStore` whose `read()` returns empty ownership and whose `update()` throws `SetupStorageError('forced metadata failure')`.

After rejection, assert:

```ts
expect(existsSync(configPath)).toBe(false);
expect(readdirSync(root).some((name) => name.includes('.relay-backup-'))).toBe(true);
```

Also assert the thrown error states that client configuration was restored after metadata persistence failed.

- [ ] **Step 3: Run the two focused files and confirm failure.**

```bash
pnpm test -- \
  tests/unit/distribution/setup/backup-and-atomic-write.test.ts \
  tests/unit/distribution/setup/apply-integration-change.test.ts
```

Expected: FAIL because current rollback restores an empty target file.

- [ ] **Step 4: Record exact original state in `backupAndAtomicWrite()`.**

Read the target with a helper returning:

```ts
interface OriginalFileState {
  readonly existed: boolean;
  readonly contents: Buffer;
  readonly mode: number;
}
```

For `ENOENT`, return `{ existed: false, contents: Buffer.alloc(0), mode: 0o600 }`. For an existing file, read bytes and stat mode.

Return:

```ts
{
  backupPath,
  originalExisted: original.existed,
  originalMode: original.mode,
}
```

- [ ] **Step 5: Implement `restoreOriginalFile()`.**

For an absent original:

```ts
if (!input.originalExisted) {
  await unlink(input.targetPath).catch((error: unknown) => {
    if (!isMissing(error)) throw storageError(input.targetPath, error);
  });
  return;
}
```

For an existing original, delegate to the existing atomic restore implementation using `originalMode`.

Do not unlink or rewrite the backup.

- [ ] **Step 6: Use `restoreOriginalFile()` in both rollback locations.**

Inside `backupAndAtomicWrite()` after a post-replacement failure, call `restoreOriginalFile()` with the returned original state.

Inside `applyIntegrationChange()` after ownership update failure, call `restoreOriginalFile()` using the backup result. Parse the restored target only when `originalExisted` is true. When it was false, verify absence with `stat()` and accept only `ENOENT`.

- [ ] **Step 7: Retain existing-file rollback coverage.**

Add or preserve an assertion that an existing file is restored byte-for-byte and keeps its original mode after forced metadata failure. This prevents the new absence branch from weakening the existing branch.

- [ ] **Step 8: Run focused tests.**

```bash
pnpm test -- \
  tests/unit/distribution/setup/backup-and-atomic-write.test.ts \
  tests/unit/distribution/setup/apply-integration-change.test.ts \
  tests/integration/setup-workflow.test.ts
pnpm typecheck
```

Expected: all pass.

- [ ] **Step 9: Commit exact-state rollback.**

```bash
git add \
  src/distribution/setup/backup-and-atomic-write.ts \
  src/distribution/setup/apply-integration-change.ts \
  tests/unit/distribution/setup/backup-and-atomic-write.test.ts \
  tests/unit/distribution/setup/apply-integration-change.test.ts
git commit -m "fix: restore absent client configs after setup failure"
```

---

### Task 4: Run full regression, package smoke, and update PR evidence

**Files:**

- Modify only if results require it: PR #48 description
- Do not modify issue #41 acceptance criteria or the accepted ADR.

- [ ] **Step 1: Run the complete repository gate from a clean generated-output state.**

```bash
rm -rf dist coverage .relay-package
pnpm install --frozen-lockfile
pnpm verify
```

On Windows PowerShell use the repository's existing Windows-safe cleanup equivalent rather than Unix `rm`.

Expected:

- formatting passes;
- lint passes with zero warnings;
- typecheck passes;
- every test passes;
- coverage thresholds pass;
- build passes;
- metadata and asset validation pass;
- high-severity audit gate passes.

- [ ] **Step 2: Run installed-package smoke with setup/configuration enabled.**

```bash
RELAY_RUN_PACKAGE_SMOKE=1 pnpm verify:package
```

On Windows PowerShell:

```powershell
$env:RELAY_RUN_PACKAGE_SMOKE = '1'
pnpm verify:package
```

Expected: installed tarball setup, preview, apply, idempotency, disable, re-enable, remove, MCP startup, UI startup, and task-data retention all pass from an unrelated working directory.

- [ ] **Step 3: Add one manual concurrency smoke check.**

Using two disposable config files and one disposable Relay config root, start Codex and Claude setup applies at approximately the same time. After both commands complete, run:

```bash
relay config integrations --output json
```

Confirm both records are present. If one operation reports an in-progress conflict, retry it and confirm both records are present afterward. Do not use real client files for this check.

- [ ] **Step 4: Update the PR description verification section.**

Record exact final counts and commands. Include:

- the previous Linux path-test failure is fixed;
- concurrent ownership updates are serialized and regression-tested;
- rollback of a newly created config restores absence;
- `pnpm verify` result;
- package smoke result;
- manual real Codex/Claude restart validation remains the human acceptance gate.

Do not claim CodeRabbit review coverage because it skipped this draft PR.

- [ ] **Step 5: Push all remediation commits and wait for GitHub CI.**

The PR remains draft until GitHub Actions is green. Do not merge based only on local Windows verification.

- [ ] **Step 6: Human review checkpoint.**

Before marking ready, inspect:

1. `ownership-store.ts` to ensure every mutation is inside `update()` and lock release is in `finally`;
2. `apply-integration-change.ts` to ensure it never performs unlocked read-then-write metadata mutation;
3. rollback tests proving absence and existing-file restoration;
4. CI logs proving the Linux parser test passes;
5. final `config.json` after concurrent disposable setup proving both records survive.

---

## Completion Criteria

The remediation is complete only when all are true:

- Concurrent Codex and Claude setup cannot silently lose either ownership record.
- Lock contention returns exit code `4` through the existing `SetupConflictError` mapping.
- No public raw ownership `write()` method remains.
- A metadata failure after creating a new client config removes that new file.
- A metadata failure after changing an existing config restores exact contents and mode.
- Backups remain retained in both rollback paths.
- Operational parser tests use host-native absolute paths.
- GitHub Actions passes on Ubuntu.
- `pnpm verify` passes.
- `RELAY_RUN_PACKAGE_SMOKE=1 pnpm verify:package` passes.
