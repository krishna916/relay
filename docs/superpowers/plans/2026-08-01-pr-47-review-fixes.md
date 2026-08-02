# PR #47 Review Fixes Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Resolve the three correctness findings on PR #47 without widening issue #40 scope: enforce a fail-closed npm tarball allowlist, derive installed smoke-test version expectations from the package being tested, and reject `RELAY_DB_PATH=:memory:` while preserving explicit internal/test in-memory injection.

**Architecture:** Keep package policy centralized in `scripts/package/package-files.ts`, expose a pure inventory validator from `inspect-tarball.ts` so malicious/unexpected inventories can be tested without constructing archives, and pass the packed package version explicitly through installed smoke assertions. Keep runtime path precedence unchanged, but distinguish whether the selected database path came from explicit dependency injection or the public environment.

**Tech Stack:** TypeScript, Node.js 24, npm tarballs, Vitest, existing package smoke tooling, pnpm.

## Global Constraints

- Stay on branch `agent/issue-40-publishable-npm-package`; update PR #47 rather than opening another PR.
- Do not change task, MCP, HTTP, migration, or lifecycle behavior beyond the three review findings.
- The npm package remains `@krishna916/relay` with one `relay` bin.
- Package validation must be positive/fail-closed: every tarball entry must match an explicitly approved exact path or narrowly approved generated-asset pattern.
- Do not approve whole directories such as `package/dist/`, `package/skills/`, or `package/integrations/`.
- Vite hashed assets may vary by content hash, but only files directly under `package/dist/web/assets/` with approved extensions may pass.
- Source maps are not required runtime assets and must not be added to the allowlist. If current `tsup` output publishes `.map` files, exclude them from the package rather than approving them.
- The expected application version in smoke tests must come from the root package metadata used to produce the tarball; no literal release version may appear in smoke assertions.
- `:memory:` is allowed only through `explicitDatabasePath` internal/test injection. `RELAY_DB_PATH` must be a non-empty absolute filesystem path.
- Keep MCP stdout protocol-only and preserve all existing installed CLI/MCP/UI smoke coverage.
- Each task follows red-green-refactor and ends with a focused commit.
- Final acceptance requires `pnpm verify`, `pnpm verify:package`, and all focused tests to pass.

---

### Task 1: Replace the tarball denylist with a positive allowlist

**Files:**

- Modify: `scripts/package/package-files.ts`
- Modify: `scripts/package/inspect-tarball.ts`
- Modify: `tests/integration/package-tarball.test.ts`
- Modify if required to stop publishing source maps: `tsup.config.ts`

**Interfaces:**

- Consumes: `REQUIRED_PACKAGE_PATHS`, `REQUIRED_MIGRATION_PATHS`, and the normalized `package/...` entry names returned by `normalizedTarballInventory()`.
- Produces:
  - `isApprovedPackagePath(path: string): boolean`
  - `validatePackageInventory(entries: readonly string[]): void`
  - failure output containing `Missing:` and `Unexpected:` sections

- [ ] **Step 1: Add failing pure inventory-validation tests.**

In `tests/integration/package-tarball.test.ts`, import `validatePackageInventory` and `REQUIRED_PACKAGE_PATHS`. Add tests before the existing actual-archive test:

```ts
import { REQUIRED_PACKAGE_PATHS } from '../../scripts/package/package-files.js';
import {
  inspectTarball,
  normalizedTarballInventory,
  validatePackageInventory,
} from '../../scripts/package/inspect-tarball.js';

it('rejects an unexpected file inside an otherwise published directory', () => {
  const inventory = [
    ...REQUIRED_PACKAGE_PATHS,
    'package/dist/web/assets/index-ABC123.js',
    'package/skills/relay-capture/private-notes.txt',
  ];

  expect(() => validatePackageInventory(inventory)).toThrowError(
    /Unexpected:\npackage\/skills\/relay-capture\/private-notes\.txt/,
  );
});

it('accepts only narrowly generated Vite assets', () => {
  const base = [...REQUIRED_PACKAGE_PATHS];

  expect(() =>
    validatePackageInventory([
      ...base,
      'package/dist/web/assets/index-ABC123.js',
      'package/dist/web/assets/index-ABC123.css',
    ]),
  ).not.toThrow();

  for (const unexpected of [
    'package/dist/web/assets/secrets.json',
    'package/dist/web/assets/nested/index-ABC123.js',
    'package/dist/web/debug.txt',
    'package/dist/cli/extra.js',
  ]) {
    expect(() =>
      validatePackageInventory([...base, 'package/dist/web/assets/index-ABC123.js', unexpected]),
    ).toThrowError(new RegExp(unexpected.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')));
  }
});

it('rejects missing required files separately from unexpected files', () => {
  const inventory = REQUIRED_PACKAGE_PATHS.filter(
    (path) => path !== 'package/assets/migrations/0004_task_normalized_title.sql',
  );

  expect(() => validatePackageInventory(inventory)).toThrowError(
    /Missing:\npackage\/assets\/migrations\/0004_task_normalized_title\.sql/,
  );
});
```

Do not build a synthetic `.tgz` for these cases. The pure validator is the contract under test; the existing actual `npm pack` test remains the end-to-end proof.

- [ ] **Step 2: Run the focused test and confirm it fails.**

Run:

```bash
pnpm test -- tests/integration/package-tarball.test.ts
```

Expected: FAIL because `validatePackageInventory` is not exported/implemented.

- [ ] **Step 3: Define the exact package allowlist policy.**

Replace `FORBIDDEN_PACKAGE_PATTERNS` in `scripts/package/package-files.ts` with the following exports:

```ts
export const APPROVED_GENERATED_PACKAGE_PATTERNS: readonly RegExp[] = [
  /^package\/dist\/web\/assets\/[A-Za-z0-9_-]+\.(?:js|css|svg|png|jpg|jpeg|webp|ico|woff2?)$/,
];

const approvedExactPackagePaths = new Set(REQUIRED_PACKAGE_PATHS);

export function isApprovedPackagePath(path: string): boolean {
  return (
    approvedExactPackagePaths.has(path) ||
    APPROVED_GENERATED_PACKAGE_PATTERNS.some((pattern) => pattern.test(path))
  );
}
```

Rules Luna must preserve exactly:

- Every migration, skill, integration template, legal document, compiled entry point, `package.json`, and `dist/web/index.html` remains an exact required path through `REQUIRED_PACKAGE_PATHS`.
- Only content-hashed Vite assets are pattern-approved.
- The pattern permits no nested directories below `assets/`.
- The pattern permits no `.json`, `.map`, `.txt`, `.md`, `.db`, `.log`, or arbitrary extension.
- Do not retain the old forbidden-pattern check as the primary policy. A positive allowlist makes it redundant; unexpected paths fail regardless of name.

- [ ] **Step 4: Add and use the pure inventory validator.**

In `scripts/package/inspect-tarball.ts`, import `isApprovedPackagePath` and implement:

```ts
export function validatePackageInventory(entries: readonly string[]): void {
  const missing = REQUIRED_PACKAGE_PATHS.filter((path) => !entries.includes(path));
  const unexpected = entries.filter((path) => !isApprovedPackagePath(path));
  const generatedWebAssets = entries.filter((path) =>
    /^package\/dist\/web\/assets\/[A-Za-z0-9_-]+\.(?:js|css|svg|png|jpg|jpeg|webp|ico|woff2?)$/.test(
      path,
    ),
  );

  if (generatedWebAssets.length === 0) {
    missing.push('package/dist/web/assets/<generated-runtime-asset>');
  }

  if (missing.length > 0 || unexpected.length > 0) {
    throw new Error(
      `Relay npm tarball inventory mismatch.\nMissing:\n${missing.join('\n') || '(none)'}\nUnexpected:\n${unexpected.join('\n') || '(none)'}`,
    );
  }
}

export async function inspectTarball(tarballPath: string): Promise<void> {
  validatePackageInventory(normalizedTarballInventory(tarballPath));
}
```

Use the same approved generated-asset regex in one place only. Prefer exporting a helper/pattern from `package-files.ts` rather than duplicating the literal regex as shown in the minimal sketch above.

- [ ] **Step 5: Ensure compiled source maps are not published.**

Run the actual tarball test:

```bash
pnpm test -- tests/integration/package-tarball.test.ts
```

If it reports unexpected `package/dist/**/*.js.map` entries, modify `tsup.config.ts` from:

```ts
sourcemap: true,
```

to:

```ts
sourcemap: false,
```

Do not add `.map` to the allowlist. Rebuild and rerun the test.

Expected: PASS, and an injected file such as `package/skills/relay-capture/private-notes.txt` is rejected.

- [ ] **Step 6: Run package-content verification.**

```bash
pnpm pack:tarball
pnpm verify:package:contents
```

Expected: PASS. Manually inspect the printed inventory and confirm every entry is covered by either `REQUIRED_PACKAGE_PATHS` or the generated Vite-asset pattern.

- [ ] **Step 7: Commit the fail-closed package policy.**

```bash
git add scripts/package/package-files.ts scripts/package/inspect-tarball.ts tests/integration/package-tarball.test.ts tsup.config.ts
git commit -m "fix: enforce package file allowlist"
```

If `tsup.config.ts` did not change, omit it from `git add`.

---

### Task 2: Derive installed smoke-test version expectations from package metadata

**Files:**

- Modify: `scripts/package/smoke-installed-package.ts`
- Modify: `tests/integration/installed-package.test.ts`

**Interfaces:**

- Consumes: root `package.json` version from the same checkout passed to `verifyInstalledPackage(rootDir)`.
- Produces:
  - `readExpectedPackageVersion(rootDir: string): string`
  - `verifyMcp(..., expectedVersion: string): Promise<void>`
  - UI and MCP assertions against the derived value

- [ ] **Step 1: Add a failing version-derivation test.**

In `tests/integration/installed-package.test.ts`, add a temporary package-root fixture test that proves the helper does not use `0.1.0`:

```ts
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import {
  readExpectedPackageVersion,
  verifyInstalledPackage,
} from '../../scripts/package/smoke-installed-package.js';

it('derives the expected smoke version from package metadata', () => {
  const root = mkdtempSync(join(tmpdir(), 'relay-version-fixture-'));
  try {
    mkdirSync(root, { recursive: true });
    writeFileSync(
      join(root, 'package.json'),
      JSON.stringify({ name: '@krishna916/relay', version: '9.8.7' }),
      'utf8',
    );

    expect(readExpectedPackageVersion(root)).toBe('9.8.7');
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
});
```

Merge imports with the file’s existing imports rather than creating duplicate import statements.

- [ ] **Step 2: Run the focused test and confirm it fails.**

```bash
pnpm test -- tests/integration/installed-package.test.ts
```

Expected: FAIL because `readExpectedPackageVersion` does not exist.

- [ ] **Step 3: Implement strict package-version reading.**

In `scripts/package/smoke-installed-package.ts`, extend the `node:fs` import with `readFileSync`, then add:

```ts
export function readExpectedPackageVersion(rootDir: string): string {
  const packagePath = join(rootDir, 'package.json');
  const parsed = JSON.parse(readFileSync(packagePath, 'utf8')) as {
    readonly name?: string;
    readonly version?: string;
  };

  if (parsed.name !== '@krishna916/relay') {
    throw new Error(`Package smoke expected @krishna916/relay metadata at ${packagePath}.`);
  }
  if (!/^(?:0|[1-9]\d*)\.(?:0|[1-9]\d*)\.(?:0|[1-9]\d*)$/.test(parsed.version ?? '')) {
    throw new Error(`Package smoke found an invalid version in ${packagePath}.`);
  }

  return parsed.version!;
}
```

Do not import production `readPackageVersion()` here. The smoke script must read the source package metadata that controls the tarball it is about to build; this avoids accidentally validating against repository/module resolution behavior.

- [ ] **Step 4: Thread the derived version through MCP and UI checks.**

At the start of `verifyInstalledPackage` add:

```ts
const expectedVersion = readExpectedPackageVersion(rootDir);
```

Change `verifyMcp` to accept `expectedVersion`:

```ts
async function verifyMcp(
  commandPath: string,
  installedMain: string,
  cwd: string,
  databasePath: string,
  taskId: string,
  expectedVersion: string,
): Promise<void> {
```

Replace:

```ts
parsed.version !== '0.1.0';
```

with:

```ts
parsed.version !== expectedVersion;
```

Pass `expectedVersion` from `verifyInstalledPackage`, and replace the UI assertion:

```ts
health.version !== '0.1.0';
```

with:

```ts
health.version !== expectedVersion;
```

Improve errors so mismatches show both values:

```ts
throw new Error(
  `Installed MCP health reported version ${String(parsed.version)}; expected ${expectedVersion}.`,
);
```

Use equivalent wording for UI health.

- [ ] **Step 5: Prove no literal release version remains in package smoke logic.**

Run:

```bash
rg "0\.1\.0" scripts/package tests/integration/installed-package.test.ts
```

Expected: no result from `scripts/package/smoke-installed-package.ts`. A literal may remain only in an intentionally version-specific fixture unrelated to smoke expectations; remove it if it controls an assertion.

- [ ] **Step 6: Run focused and installed smoke tests.**

```bash
pnpm test -- tests/integration/installed-package.test.ts
pnpm verify:package
```

Expected: PASS. MCP health and UI health both equal the package version read before packing.

- [ ] **Step 7: Commit version-consistency verification.**

```bash
git add scripts/package/smoke-installed-package.ts tests/integration/installed-package.test.ts
git commit -m "fix: derive installed smoke version"
```

---

### Task 3: Restrict the in-memory database exception to explicit injection

**Files:**

- Modify: `src/distribution/resolve-runtime-paths.ts`
- Modify: `tests/unit/distribution/runtime-paths.test.ts`
- Modify only if an existing test relies on the invalid environment behavior: the directly affected test file

**Interfaces:**

- Consumes precedence:
  1. `explicitDatabasePath`
  2. `env.RELAY_DB_PATH`
  3. platform default
- Produces:
  - explicit `:memory:` accepted
  - environment `:memory:` rejected as non-absolute
  - explicit absolute path still overrides environment
  - empty/whitespace environment remains a validation error

- [ ] **Step 1: Add tests that distinguish explicit injection from environment override.**

In `tests/unit/distribution/runtime-paths.test.ts`, add:

```ts
it('allows an in-memory database only through explicit internal injection', () => {
  expect(
    resolveRuntimePaths({
      platform: 'linux',
      homeDir: '/home/relay',
      env: {},
      explicitDatabasePath: ':memory:',
    }).databasePath,
  ).toBe(':memory:');
});

it('rejects an in-memory database supplied through RELAY_DB_PATH', () => {
  expect(() =>
    resolveRuntimePaths({
      platform: 'linux',
      homeDir: '/home/relay',
      env: { RELAY_DB_PATH: ':memory:' },
    }),
  ).toThrowError('Database path must be absolute: :memory:');
});

it('does not let an invalid environment value override explicit in-memory injection', () => {
  expect(
    resolveRuntimePaths({
      platform: 'linux',
      homeDir: '/home/relay',
      env: { RELAY_DB_PATH: 'relative.db' },
      explicitDatabasePath: ':memory:',
    }).databasePath,
  ).toBe(':memory:');
});
```

Keep or add the existing absolute environment-path test:

```ts
expect(
  resolveRuntimePaths({
    platform: 'linux',
    homeDir: '/home/relay',
    env: { RELAY_DB_PATH: '/tmp/relay.db' },
  }).databasePath,
).toBe('/tmp/relay.db');
```

- [ ] **Step 2: Run the focused test and confirm the environment case fails.**

```bash
pnpm test -- tests/unit/distribution/runtime-paths.test.ts
```

Expected: FAIL because `RELAY_DB_PATH=:memory:` is currently accepted.

- [ ] **Step 3: Track the source of the selected path explicitly.**

Replace the candidate selection in `selectDatabasePath` with source-aware logic:

```ts
const fromExplicitInput = input.explicitDatabasePath !== undefined;
const candidate = fromExplicitInput ? input.explicitDatabasePath : env.RELAY_DB_PATH;

if (candidate !== undefined) {
  const normalized = candidate.trim();
  if (!normalized) {
    throw new RelayError('RELAY_DB_PATH/database path cannot be empty or whitespace only.');
  }

  const isExplicitInMemory = fromExplicitInput && normalized === ':memory:';
  if (!isExplicitInMemory && !isAbsoluteForPlatform(normalized, platform)) {
    throw new RelayError(`Database path must be absolute: ${normalized}`);
  }

  return normalized;
}
```

Do not infer source by comparing values after `??`; the explicit and environment values may be identical. Preserve explicit-input precedence even when the environment is invalid.

- [ ] **Step 4: Run path, database, and installed-package regressions.**

```bash
pnpm test -- tests/unit/distribution/runtime-paths.test.ts
pnpm test -- tests/unit/database/connection.test.ts
pnpm verify:package
```

Expected: PASS. The installed smoke continues using an absolute temporary `RELAY_DB_PATH`.

- [ ] **Step 5: Commit the contract correction.**

```bash
git add src/distribution/resolve-runtime-paths.ts tests/unit/distribution/runtime-paths.test.ts
git commit -m "fix: restrict in-memory database override"
```

---

### Task 4: Run final verification and close the review threads

**Files:**

- Modify only when a verification failure identifies a defect directly caused by Tasks 1–3.
- Do not add unrelated cleanup to this PR.

**Interfaces:**

- Consumes: the three focused commits.
- Produces: green repository verification, green installed package smoke, inspected fail-closed tarball, and replies on all three review threads with evidence.

- [ ] **Step 1: Run formatting without silently mixing changes.**

```bash
pnpm format

git diff --check
git status --short
```

Inspect every formatting change. Retain only files touched by this plan.

- [ ] **Step 2: Run the complete verification sequence.**

```bash
pnpm verify
pnpm pack:tarball
pnpm verify:package:contents
pnpm verify:package
```

Expected: all commands exit `0`.

- [ ] **Step 3: Inspect the tarball inventory manually.**

From the output of `pnpm verify:package:contents`, confirm:

- no source maps
- no tests, source files, repository metadata, databases, logs, `.env` files, caches, or MCPB staging output
- only the three compiled Node entry points
- only exact canonical skills and integrations
- all four migrations
- `dist/web/index.html` and only generated runtime assets under `dist/web/assets/`

If any unexpected entry is present, fix the package source/allowlist rather than weakening the validator.

- [ ] **Step 4: Commit any formatting-only follow-up if needed.**

```bash
git add <only files already touched by Tasks 1-3>
git commit -m "style: format PR 47 review fixes"
```

Skip this commit when `git status --short` is clean.

- [ ] **Step 5: Push the branch and reply to each review thread.**

```bash
git push origin agent/issue-40-publishable-npm-package
```

Reply to the tarball thread with:

```text
Fixed with a fail-closed positive allowlist. Every tarball entry must now be an exact approved path or a narrowly matched Vite runtime asset. Added regression coverage for an unexpected file under `skills/` and for disallowed generated-asset paths. `pnpm verify:package:contents` passes against the real tarball.
```

Reply to the version thread with:

```text
Fixed by deriving the expected version from the root `package.json` used to produce the tarball and threading it through MCP and UI smoke assertions. Added a non-0.1.0 fixture test and reran `pnpm verify:package`.
```

Reply to the runtime-path thread with:

```text
Fixed by tracking whether the selected value came from explicit injection or `RELAY_DB_PATH`. Explicit `:memory:` remains valid for tests/internal use; environment `:memory:` now fails the absolute-path contract. Added precedence and regression tests.
```

- [ ] **Step 6: Resolve threads only after CI is green.**

Do not resolve a thread merely because code was pushed. Confirm the PR’s CI run for the latest head SHA succeeds, then resolve all three addressed threads.

## Human Review Checkpoint

Before merging PR #47, manually verify:

1. Add a temporary extra file under `skills/relay-capture/`, run `npm pack`, and confirm inventory validation fails; remove the file afterward.
2. Temporarily change the package version locally to a different valid semver, run the installed smoke, and confirm MCP/UI assertions follow that version; revert the change afterward.
3. Run the CLI with `RELAY_DB_PATH=:memory:` and confirm startup fails with the absolute-path error.
4. Confirm tests that inject `explicitDatabasePath: ':memory:'` still pass.
5. Confirm the latest CI run and `pnpm verify:package` are green.

## Deferred Decisions

- Do not redesign package staging or introduce a general manifest generator in this fix.
- Do not add new package asset categories.
- Do not add a `RELAY_HOME` override.
- Do not change registry publication, setup, doctor, release workflows, or platform claims.
- Do not resolve unrelated review or CodeRabbit findings inside these commits.
