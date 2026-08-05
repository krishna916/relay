# PR #49 Cross-Platform Path Test Remediation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Restore green CI by making the doctor path-check unit fixtures use absolute paths native to the current test host, without weakening or changing Relay's production path-validation behavior.

**Architecture:** Keep `createPathResolutionCheck()` and `createPathAccessCheck()` unchanged. Replace the Windows-only positive fixture in `check-paths.test.ts` with paths constructed through Node's host-native `path.resolve()` and `path.join()` functions. Retain one explicit relative-path negative case so the test continues proving that invalid paths are rejected.

**Tech Stack:** Node.js 24 (`>=24 <25`), TypeScript/ESM, Node `path`, Vitest, existing Relay doctor path-check modules.

## Global Constraints

- Do not modify `src/distribution/doctor/check-paths.ts` for this remediation.
- Do not accept Windows paths as absolute on POSIX or POSIX paths as absolute on Windows.
- Do not introduce `path.win32`, `path.posix`, custom drive-letter detection, path-style guessing, or cross-platform absolute-path emulation into production code.
- Runtime paths remain valid only when they are absolute and normalized according to the host operating system executing Relay.
- Preserve the existing diagnostic IDs, statuses, messages, and details contract.
- Preserve the negative test proving that a relative runtime path returns `paths.resolution.invalid`.
- Tests must not depend on the repository's physical checkout path, a particular username, drive letter, home directory, or current working directory contents.
- Use path strings only; do not create real directories or files for the resolution-check tests.
- Keep this remediation to one production-neutral test commit unless verification exposes an independent issue.
- Do not rerun CI as a substitute for first reproducing the focused test locally.
- `pnpm format:check`, the focused path tests, `pnpm typecheck`, and `pnpm verify` must pass before the PR is considered ready.

---

## Root Cause

`tests/unit/distribution/doctor/check-paths.test.ts` currently defines the shared fixture using Windows-only strings:

```ts
const runtimePaths: RuntimePaths = {
  dataRoot: 'D:\\Users\\relay\\AppData',
  configRoot: 'D:\\Users\\relay\\Config',
  cacheRoot: 'D:\\Users\\relay\\Cache',
  databasePath: 'D:\\Users\\relay\\AppData\\relay.db',
};
```

The positive test also passes:

```ts
metadataPath: 'D:\\Users\\relay\\Config\\config.json';
```

On GitHub Actions Ubuntu, Node's host-native `path.isAbsolute()` correctly treats these strings as non-absolute. `createPathResolutionCheck()` therefore returns `paths.resolution.invalid`, while the test expects `paths.resolution.valid`.

This is a test-fixture defect. The implementation must remain host-native because Relay resolves and uses paths on the operating system where it is running.

---

### Task 1: Replace Windows-only fixtures with host-native absolute paths

**Files:**

- Modify: `tests/unit/distribution/doctor/check-paths.test.ts`

**Interfaces:**

- Consumes: `RuntimePaths`, `createPathResolutionCheck()`, and `createPathAccessCheck()` unchanged.
- Produces: one host-native `runtimePaths` fixture and one host-native `metadataPath` fixture reused by all tests.
- Preserves: every existing assertion and production contract except literal Windows path strings.

- [ ] **Step 1: Reproduce the CI failure using the exact focused test.**

Run:

```bash
pnpm test -- tests/unit/distribution/doctor/check-paths.test.ts
```

Expected before the fix on Linux/macOS:

```text
FAIL reports resolved absolute paths without depending on cwd
Expected: paths.resolution.valid
Received: paths.resolution.invalid
```

On Windows the test may already pass, which is itself evidence that the fixture is host-dependent. Continue with the same remediation.

- [ ] **Step 2: Import Node's host-native path helpers.**

Add this import at the top of `check-paths.test.ts`:

```ts
import { join, resolve } from 'node:path';
```

Do not import `win32`, `posix`, `isAbsolute`, or `normalize`; the test should exercise production validation rather than duplicate its logic.

- [ ] **Step 3: Replace the shared Windows fixture with a host-native absolute fixture.**

Replace the existing `runtimePaths` constant with exactly this structure:

```ts
const fixtureRoot = resolve('tmp', 'relay-doctor-paths');

const runtimePaths: RuntimePaths = {
  dataRoot: join(fixtureRoot, 'data'),
  configRoot: join(fixtureRoot, 'config'),
  cacheRoot: join(fixtureRoot, 'cache'),
  databasePath: join(fixtureRoot, 'data', 'relay.db'),
};

const metadataPath = join(fixtureRoot, 'config', 'config.json');
```

Why this shape is required:

- `resolve()` makes `fixtureRoot` absolute according to the current host.
- `join()` preserves native path separators and normalization.
- The paths remain synthetic; no filesystem creation is required.
- The fixture is deterministic within the process and independent of username or drive letter.

Do not use `process.cwd()` string concatenation. Do not use `os.tmpdir()` because these tests are validating strings, not filesystem behavior, and no actual temporary resource is needed.

- [ ] **Step 4: Replace every repeated metadata literal with the shared fixture.**

Change all three occurrences of:

```ts
'D:\\Users\\relay\\Config\\config.json';
```

into:

```ts
metadataPath;
```

This applies to:

1. the healthy resolution test;
2. the missing ownership metadata warning test;
3. the required-root failure test.

Keep this existing assertion logic:

```ts
if (value.endsWith('config.json')) throw new Error('missing');
```

It is separator-independent and does not need modification.

- [ ] **Step 5: Preserve the relative-path negative test exactly in intent.**

Keep the negative override as:

```ts
runtimePaths: { ...runtimePaths, dataRoot: 'relative' }
```

Use the shared absolute metadata fixture:

```ts
metadataPath;
```

The complete input should become:

```ts
const result = await createPathResolutionCheck({
  runtimePaths: { ...runtimePaths, dataRoot: 'relative' },
  metadataPath,
}).run();
```

Do not change the expected result:

```ts
expect(result).toMatchObject({
  status: 'failure',
  code: 'paths.resolution.invalid',
});
```

- [ ] **Step 6: Run the focused test and confirm all four tests pass.**

Run:

```bash
pnpm test -- tests/unit/distribution/doctor/check-paths.test.ts
```

Expected:

```text
1 test file passed
4 tests passed
```

- [ ] **Step 7: Run formatting and type checking before the full gate.**

Run:

```bash
pnpm format:check
pnpm typecheck
```

Expected: both commands exit `0`.

If formatting fails, run:

```bash
pnpm format tests/unit/distribution/doctor/check-paths.test.ts
pnpm format:check
```

Do not make unrelated formatting changes.

- [ ] **Step 8: Run adjacent doctor tests to ensure the fixture change did not mask behavior.**

Run:

```bash
pnpm test -- \
  tests/unit/distribution/doctor/check-paths.test.ts \
  tests/unit/distribution/doctor/run-doctor.test.ts \
  tests/unit/interfaces/cli/doctor-command.test.ts
```

Expected: all selected tests pass.

- [ ] **Step 9: Run the complete authoritative verification gate.**

Run:

```bash
pnpm verify
```

Expected:

- formatting passes;
- lint passes with zero warnings;
- TypeScript passes;
- all coverage tests pass, including `check-paths.test.ts`;
- build passes;
- package metadata and repository assets validate;
- audit behavior is reported according to the repository's existing environment constraints.

If `pnpm verify` fails anywhere other than the already documented external audit condition, stop and diagnose that failure rather than expanding this patch speculatively.

- [ ] **Step 10: Commit only the test-fixture correction.**

```bash
git add tests/unit/distribution/doctor/check-paths.test.ts
git commit -m "test: use host-native doctor path fixtures"
```

Do not include generated output, coverage files, built `dist/` changes, lockfile changes, or unrelated edits.

---

### Task 2: Confirm GitHub Actions and close the CI remediation loop

**Files:**

- No code changes expected.
- Update the PR description only if its validation counts or CI claim are currently inaccurate.

**Interfaces:**

- Consumes: commit from Task 1.
- Produces: a green PR workflow run and an accurate PR status summary.

- [ ] **Step 1: Push the focused remediation commit to the existing PR branch.**

```bash
git push origin feature/issue-42-relay-doctor-diagnostics
```

Do not open a second PR.

- [ ] **Step 2: Verify GitHub Actions runs against the new head SHA.**

Confirm the `CI / verify` job is associated with the new commit, not the previous failing head `b8e51c544f5e7475650097cd3945edb8d9e3c245` or its merge SHA.

- [ ] **Step 3: Inspect the full workflow result rather than only the combined status badge.**

Acceptance requires:

- `Run verification gate` succeeds;
- the previously skipped downstream MCPB steps execute according to workflow conditions;
- no `check-paths.test.ts` failure remains;
- the workflow conclusion is `success`.

- [ ] **Step 4: Update the PR validation summary if test counts changed.**

Use the counts from the successful CI run. Do not preserve stale local counts or claim `pnpm verify` passed if the GitHub Actions run is still failing.

- [ ] **Step 5: Request re-review only after CI is green.**

In the PR comment, include:

```text
Addressed the cross-platform path-fixture CI failure.

- Replaced Windows-only positive fixtures with host-native paths built using node:path resolve/join.
- Preserved the explicit relative-path rejection test.
- Production path validation is unchanged.
- Focused doctor tests, typecheck, and pnpm verify pass.
- GitHub Actions CI / verify is green on the updated head.
```

Only state the final two lines after they are actually verified.

---

## Expected Final Diff

The implementation diff should be limited to `tests/unit/distribution/doctor/check-paths.test.ts` and look semantically like this:

```diff
+import { join, resolve } from 'node:path';
 import { describe, expect, it } from 'vitest';

+const fixtureRoot = resolve('tmp', 'relay-doctor-paths');
+
 const runtimePaths: RuntimePaths = {
-  dataRoot: 'D:\\Users\\relay\\AppData',
-  configRoot: 'D:\\Users\\relay\\Config',
-  cacheRoot: 'D:\\Users\\relay\\Cache',
-  databasePath: 'D:\\Users\\relay\\AppData\\relay.db',
+  dataRoot: join(fixtureRoot, 'data'),
+  configRoot: join(fixtureRoot, 'config'),
+  cacheRoot: join(fixtureRoot, 'cache'),
+  databasePath: join(fixtureRoot, 'data', 'relay.db'),
 };
+
+const metadataPath = join(fixtureRoot, 'config', 'config.json');
```

All hard-coded Windows metadata paths should become `metadataPath`. No production file should change.

## Acceptance Criteria

- [ ] The positive resolution test uses host-native absolute and normalized paths.
- [ ] The relative-path negative test still returns `paths.resolution.invalid`.
- [ ] The access-check tests remain filesystem-free and preserve their existing status/code assertions.
- [ ] `src/distribution/doctor/check-paths.ts` is unchanged.
- [ ] Focused path tests pass on the current host.
- [ ] Formatting, lint, typecheck, and full verification pass.
- [ ] GitHub Actions `CI / verify` concludes successfully on the new PR head.
- [ ] No unrelated files are included in the implementation commit.

## Human Review Checkpoint

Before accepting the remediation, inspect the implementation commit and confirm:

1. only the test fixture changed;
2. no production path logic was relaxed;
3. the positive test uses `resolve()`/`join()` rather than OS-specific literals;
4. the negative relative-path test remains;
5. the GitHub Actions run belongs to the latest head and is green.
