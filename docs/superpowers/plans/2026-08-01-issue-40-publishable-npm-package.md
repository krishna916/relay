# Issue #40 Publishable npm Package Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Produce one deterministic, globally installable `@krishna916/relay` npm tarball exposing a stable `relay` executable that runs task/session commands, MCP, and the loopback UI from any working directory.

**Architecture:** Keep the existing application services and interface adapters authoritative. Add a thin top-level executable dispatcher, one shared mutable-path resolver, and one package-relative immutable-asset resolver. Build all runtime code and assets into an allowlisted tarball, then verify the actual packed artifact by installing it into an isolated prefix and exercising the installed command outside the repository.

**Tech Stack:** Node.js 24 (`>=24 <25`), TypeScript/ESM, pnpm 10.2.0, tsup, Vite/React, SQLite with `better-sqlite3`, official MCP TypeScript SDK, Vitest, npm-compatible package tarballs.

## Global Constraints

- Public package name is `@krishna916/relay`; public executable name is `relay`.
- Use the existing single package. Do not create a monorepo or separately versioned runtime packages.
- Node.js 24 only: `>=24 <25`.
- Initial supported release claims remain Windows x64, macOS arm64, and Linux x64/glibc only.
- Existing task/session command contracts, payload schemas, lifecycle rules, and exit categories `0`–`5` must remain unchanged.
- Do not duplicate task, MCP, HTTP, migration, or lifecycle logic in the dispatcher or packaging scripts.
- `relay mcp` must keep stdout protocol-only; all diagnostics go to stderr.
- `relay ui` binds to loopback only and remains an on-demand foreground process.
- Mutable data/config/cache paths never depend on `cwd`, repository root, executable directory, or package installation directory.
- Database precedence is: explicit injected absolute path, non-empty absolute `RELAY_DB_PATH`, platform default.
- Empty/whitespace `RELAY_DB_PATH` and relative installed/public database paths are validation errors.
- Immutable assets resolve package-relatively using `import.meta.url`/`fileURLToPath`, never `cwd`.
- Do not package a durable database, user configuration, cache, logs, tests, secrets, repository metadata, `.mcpb`, or development-only output.
- Keep `better-sqlite3` external/native in the normal npm installation model.
- Preserve exactly one root `pnpm` object containing both `overrides.tmp = "0.2.7"` and `onlyBuiltDependencies = ["better-sqlite3", "esbuild"]`.
- MCPB staging remains independently verifiable. npm packaging must not remove or invalidate Claude Desktop bundle metadata proven in issue #36.
- One package version is the application version used by CLI, MCP health, UI diagnostics, skills, integration assets, and generated package metadata.
- Packaging scripts must be deterministic, non-destructive, and safe to run repeatedly.
- Registry publication, setup, doctor, automatic agent configuration, GitHub Releases, standalone binaries, installers, daemonization, telemetry, and data deletion are out of scope.
- `pnpm verify` and the new package verification command must pass.

---

## Locked File and Module Structure

Create or modify the following focused units. Follow existing names when a semantically equivalent file already exists; do not introduce a second implementation.

- `src/distribution/platform-paths.ts`: pure platform/env/home path calculation for data, config, cache, and database defaults.
- `src/distribution/resolve-runtime-paths.ts`: validates explicit/environment overrides and returns the effective mutable runtime paths.
- `src/distribution/package-assets.ts`: resolves package root and immutable packaged assets from `import.meta.url`.
- `src/distribution/package-version.ts`: reads/validates the application version from the packaged `package.json` once.
- `src/interfaces/cli/main.ts`: only public executable entry point and top-level operational dispatcher.
- `src/interfaces/cli/run-task-cli.ts` or the existing `run-cli.ts`: unchanged task/session behavior, called by the dispatcher.
- `src/interfaces/mcp/main.ts`: export a callable foreground MCP start function while retaining direct-entry compatibility during migration.
- `src/interfaces/http/main.ts`: export a callable foreground UI/API start function while retaining direct-entry compatibility during migration.
- `src/interfaces/http/create-http-server.ts`: accept packaged web-root/version dependencies; never derive assets from `cwd`.
- `src/database/database-config.ts`: delegate to the shared resolver; remove divergent platform/env behavior.
- `src/database/migrations/*`: load SQL through the immutable asset resolver or an injected migration directory.
- `scripts/package/package-files.ts`: canonical allowlist and required/forbidden tarball inventory rules.
- `scripts/package/verify-package-metadata.ts`: root package, lockfile, and MCPB metadata drift checks.
- `scripts/package/inspect-tarball.ts`: inspect the actual `npm pack --json` artifact.
- `scripts/package/smoke-installed-package.ts`: isolated-prefix install and installed-command smoke harness.
- `tests/unit/distribution/*`: path, asset, version, and dispatcher contract tests.
- `tests/integration/package-tarball.test.ts`: tarball inventory and arbitrary-`cwd` installed execution.
- `docs/distribution/npm-package.md`: install-from-tarball, manual verification, native dependency guidance, and known platform limits.

The package must contain, at minimum:

- compiled Node entry/runtime files under `dist/`
- built React assets under the selected packaged web directory
- SQL migrations
- canonical skills
- integration templates required by supported agents
- `package.json`, `README.md`, licence, and notices

The package must exclude, at minimum:

- `src/`, `web/src/`, `tests/`, coverage, temporary databases, `.env*`, `.git*`, `.github/`, `.mcpb/`, local logs/cache/config, plan documents, and arbitrary build staging directories

---

### Task 1: Lock package metadata and metadata validation

**Files:**

- Modify: `package.json`
- Modify: `pnpm-lock.yaml`
- Create: `scripts/package/verify-package-metadata.ts`
- Create: `tests/unit/distribution/package-metadata.test.ts`
- Modify: `scripts/validate-repository-assets.ts`

**Interfaces:**

- Consumes: issue #39 package/runtime contract and issue #36 native-build compatibility evidence.
- Produces: publishable root metadata and one validation command used by repository verification, npm tarball checks, and MCPB staging checks.

- [ ] **Step 1: Write failing metadata tests before changing package metadata.**

Test the parsed root `package.json`, not string fragments. Assert:

```ts
expect(pkg.name).toBe('@krishna916/relay');
expect(pkg.private).toBeUndefined();
expect(pkg.version).toMatch(/^\d+\.\d+\.\d+$/);
expect(pkg.engines).toEqual({ node: '>=24 <25' });
expect(pkg.bin).toEqual({ relay: './dist/cli/main.js' });
expect(pkg.pnpm).toEqual({
  overrides: { tmp: '0.2.7' },
  onlyBuiltDependencies: ['better-sqlite3', 'esbuild'],
});
```

Also parse `package.json` with a duplicate-key detecting JSON parser or a small lexical guard and fail if more than one top-level `pnpm` key exists. Assert the lockfile still resolves the `tmp` override to `0.2.7` and does not resolve `tmp@0.0.33`.

- [ ] **Step 2: Run the focused test and confirm the current package name/bin/private metadata fails.**

Run: `pnpm test -- tests/unit/distribution/package-metadata.test.ts`

Expected: FAIL because the root package is still named `relay`, is private, and exposes `relay-mcp`.

- [ ] **Step 3: Update root package publication metadata without adding speculative fields.**

Set:

```json
{
  "name": "@krishna916/relay",
  "version": "0.1.0",
  "type": "module",
  "engines": { "node": ">=24 <25" },
  "bin": { "relay": "./dist/cli/main.js" },
  "pnpm": {
    "overrides": { "tmp": "0.2.7" },
    "onlyBuiltDependencies": ["better-sqlite3", "esbuild"]
  }
}
```

Remove `private: true`. Add only metadata required for a valid public tarball: `license`, `repository`, `bugs`, `homepage`, and `files`. Do not add npm publication automation.

- [ ] **Step 4: Define one explicit source of truth for native build approvals.**

`verify-package-metadata.ts` must export:

```ts
export const REQUIRED_ONLY_BUILT_DEPENDENCIES = ['better-sqlite3', 'esbuild'] as const;
export const REQUIRED_PNPM_OVERRIDES = { tmp: '0.2.7' } as const;
export function verifyPackageMetadata(rootDir: string): void;
```

Use these constants when validating root metadata and generated MCPB runtime metadata. Do not hand-maintain a second independent list in the MCPB staging code; import or inject the constants there.

- [ ] **Step 5: Regenerate the lockfile and run metadata/MCPB staging checks.**

Run:

```bash
corepack pnpm install --lockfile-only
pnpm test -- tests/unit/distribution/package-metadata.test.ts tests/integration/mcpb-stage.test.ts
pnpm validate:assets
```

Expected: PASS; `tmp` remains pinned to `0.2.7`; MCPB metadata retains required native build approvals.

- [ ] **Step 6: Commit the metadata contract.**

```bash
git add package.json pnpm-lock.yaml scripts/package/verify-package-metadata.ts tests/unit/distribution/package-metadata.test.ts scripts/validate-repository-assets.ts scripts/mcpb
git commit -m "build: define publishable Relay package metadata"
```

### Task 2: Implement one shared mutable runtime-path resolver

**Files:**

- Create: `src/distribution/platform-paths.ts`
- Create: `src/distribution/resolve-runtime-paths.ts`
- Modify: `src/database/database-config.ts`
- Modify: `src/interfaces/shared/create-task-runtime.ts`
- Create: `tests/unit/distribution/runtime-paths.test.ts`
- Modify: existing database configuration tests

**Interfaces:**

- Produces:

```ts
export interface PlatformPathInput {
  readonly platform: NodeJS.Platform;
  readonly homeDir: string;
  readonly env: Readonly<Record<string, string | undefined>>;
}

export interface RuntimePaths {
  readonly dataRoot: string;
  readonly configRoot: string;
  readonly cacheRoot: string;
  readonly databasePath: string;
}

export function getPlatformDefaultPaths(input: PlatformPathInput): RuntimePaths;
export function resolveRuntimePaths(input?: {
  readonly explicitDatabasePath?: string;
  readonly platform?: NodeJS.Platform;
  readonly homeDir?: string;
  readonly env?: Readonly<Record<string, string | undefined>>;
}): RuntimePaths;
```

- [ ] **Step 1: Write table-driven failing tests from the issue #39 fixtures.**

Cover exact defaults:

- Windows data/database: `%LOCALAPPDATA%\Relay\relay.db`; config: `%APPDATA%\Relay\config.json`; cache: `%LOCALAPPDATA%\Relay\Cache`.
- macOS data: `~/Library/Application Support/Relay`; config beneath `.../Relay/config`; cache: `~/Library/Caches/Relay`.
- Linux XDG defaults and explicit `XDG_DATA_HOME`, `XDG_CONFIG_HOME`, `XDG_CACHE_HOME`.

Cover precedence and validation:

- explicit absolute path beats `RELAY_DB_PATH`
- absolute `RELAY_DB_PATH` beats platform default
- empty/whitespace `RELAY_DB_PATH` throws a usage/validation `RelayError`
- relative explicit or environment paths throw
- output is independent of mocked `cwd`

- [ ] **Step 2: Confirm the current implementation fails Windows, whitespace-env, relative-path, and config/cache cases.**

Run: `pnpm test -- tests/unit/distribution/runtime-paths.test.ts`

Expected: FAIL against `src/database/database-config.ts`.

- [ ] **Step 3: Implement pure platform defaults without reading process globals.**

`getPlatformDefaultPaths()` must use only its input. Use `path.win32` for Windows fixtures and `path.posix` for macOS/Linux fixtures so tests are host-independent.

- [ ] **Step 4: Implement validation and precedence in `resolveRuntimePaths()`.**

Production defaults may read `process.platform`, `homedir()`, and `process.env` only at the outer function boundary. Validate with `isAbsolute()` using platform-appropriate path semantics. Keep test injection explicit.

- [ ] **Step 5: Make database configuration a compatibility wrapper.**

Keep existing exports if other modules/tests use them, but delegate:

```ts
export function getDefaultDatabasePath(): string {
  return resolveRuntimePaths().databasePath;
}

export function resolveDatabasePath(explicitPath?: string): string {
  return resolveRuntimePaths({ explicitDatabasePath: explicitPath }).databasePath;
}
```

Do not retain separate environment/platform logic.

- [ ] **Step 6: Run focused tests and all database/runtime tests.**

Run:

```bash
pnpm test -- tests/unit/distribution/runtime-paths.test.ts tests/unit/database
pnpm typecheck
```

Expected: PASS.

- [ ] **Step 7: Commit the shared resolver.**

```bash
git add src/distribution src/database/database-config.ts src/interfaces/shared/create-task-runtime.ts tests/unit/distribution tests/unit/database
git commit -m "feat: resolve Relay runtime paths consistently"
```

### Task 3: Add package-relative immutable asset and version discovery

**Files:**

- Create: `src/distribution/package-assets.ts`
- Create: `src/distribution/package-version.ts`
- Modify: migration loading module(s)
- Modify: `src/interfaces/http/create-http-server.ts`
- Create: `tests/unit/distribution/package-assets.test.ts`
- Create: `tests/fixtures/package-root/package.json`

**Interfaces:**

```ts
export interface PackageAssets {
  readonly packageRoot: string;
  readonly migrationsDir: string;
  readonly webRoot: string;
  readonly skillsDir: string;
  readonly integrationsDir: string;
}

export function resolvePackageAssets(moduleUrl?: string): PackageAssets;
export function readPackageVersion(assets?: PackageAssets): string;
```

- [ ] **Step 1: Write failing tests that execute after changing `cwd` to an unrelated temporary directory.**

Assert all paths derive from a fixture module URL/package root, remain absolute, and do not include the temporary `cwd`. Assert missing required assets fail with an actionable error naming the missing path and reinstall guidance.

- [ ] **Step 2: Implement package-root discovery by walking upward from `fileURLToPath(moduleUrl)` to the nearest `package.json` whose name is `@krishna916/relay`.**

Do not assume a fixed number of `../` segments because bundled entry locations and tests differ. Stop at filesystem root and throw a clear internal/package-integrity error.

- [ ] **Step 3: Define exact immutable asset locations.**

Use one layout and keep it stable:

```text
<package-root>/dist/node/... compiled runtime
<package-root>/dist/web/... React production assets
<package-root>/assets/migrations/*.sql
<package-root>/skills/...
<package-root>/integrations/...
```

Adapt migration/build copy steps later to this layout. Do not make mutable paths children of package root.

- [ ] **Step 4: Read and validate the package version once.**

`readPackageVersion()` parses package JSON, requires a valid SemVer string, and never falls back to `0.0.0`, environment variables, or hard-coded duplicates.

- [ ] **Step 5: Inject asset directories into migrations and HTTP serving.**

Keep tests able to inject a temporary migrations directory/web root. Production entry points call `resolvePackageAssets()` and pass the result downward. No domain/application module may import package discovery.

- [ ] **Step 6: Run focused tests with arbitrary `cwd`.**

Run:

```bash
pnpm test -- tests/unit/distribution/package-assets.test.ts tests/unit/database tests/unit/interfaces/http
pnpm typecheck
```

Expected: PASS.

- [ ] **Step 7: Commit package-relative discovery.**

```bash
git add src/distribution src/database src/interfaces/http tests/unit/distribution tests/fixtures/package-root
git commit -m "feat: resolve packaged Relay assets independently of cwd"
```

### Task 4: Build the stable `relay` dispatcher without duplicating commands

**Files:**

- Modify: `src/interfaces/cli/main.ts`
- Modify or rename: `src/interfaces/cli/run-cli.ts`
- Create: `src/interfaces/cli/run-relay.ts`
- Modify: `src/interfaces/mcp/main.ts`
- Modify: `src/interfaces/http/main.ts`
- Modify: `tsup.config.ts`
- Create: `tests/unit/interfaces/cli/run-relay.test.ts`
- Modify: existing CLI, MCP, and HTTP startup tests

**Interfaces:**

```ts
export interface RelayCommandDependencies {
  readonly runTaskCommand: (argv: readonly string[]) => Promise<number>;
  readonly runMcp: () => Promise<number | void>;
  readonly runUi: () => Promise<number | void>;
  readonly stderr: { write(text: string): unknown };
}

export function runRelay(argv: readonly string[], deps: RelayCommandDependencies): Promise<number>;
```

- [ ] **Step 1: Write dispatcher tests before restructuring entries.**

Verify:

- `['mcp']` calls only `runMcp`
- `['ui']` calls only `runUi`
- every existing task/session command argv is passed unchanged to the existing task CLI runner
- unknown operational command uses existing usage/validation exit category `2`
- runtime creation is not performed before deciding `mcp` versus `ui` versus task command
- no dispatcher output is written to stdout for `mcp`

Use the existing parser's known task command names to distinguish task commands; do not classify arbitrary unknown words as tasks.

- [ ] **Step 2: Refactor current direct-entry modules into callable functions.**

MCP:

```ts
export async function runMcpServer(): Promise<void>;
```

HTTP/UI:

```ts
export async function runUiServer(options?: { readonly assets?: PackageAssets }): Promise<void>;
```

Direct-entry guards may remain for source-checkout compatibility, but the package exposes only `dist/cli/main.js` in `bin`.

- [ ] **Step 3: Implement `runRelay()` as routing only.**

It must not parse task DTOs, create repositories, apply lifecycle rules, or duplicate MCP/HTTP startup code. Delegate task argv to the existing `runCli` implementation unchanged.

- [ ] **Step 4: Make `src/interfaces/cli/main.ts` the sole packaged shebang entry.**

It calls `runRelay(process.argv.slice(2), productionDependencies)` and sets `process.exitCode` only for terminating commands. Long-running `mcp`/`ui` commands own their lifecycle and signal handling.

- [ ] **Step 5: Keep tsup outputs needed internally but expose one bin.**

Build `cli/main`, `mcp/main`, and `http/main` if internal or MCPB consumers require them. Root `package.json.bin` remains exactly one `relay` entry.

- [ ] **Step 6: Verify stdout/stderr behavior.**

Run:

```bash
pnpm test -- tests/unit/interfaces/cli tests/unit/interfaces/mcp tests/unit/interfaces/http
pnpm build:node
node dist/cli/main.js --help
```

For MCP startup smoke, capture stdout and assert no human diagnostic prefix appears before protocol traffic; startup logs/errors go to stderr.

- [ ] **Step 7: Commit the unified executable.**

```bash
git add src/interfaces package.json tsup.config.ts tests/unit/interfaces
git commit -m "feat: expose stable Relay command dispatcher"
```

### Task 5: Build and serve packaged migrations and React assets

**Files:**

- Modify: `vite.config.ts`
- Modify: `package.json` scripts
- Create: `scripts/package/stage-package-assets.ts`
- Modify: `src/interfaces/http/create-http-server.ts`
- Modify: HTTP route/static-serving tests
- Create: `tests/integration/packaged-assets.test.ts`

**Interfaces:**

- Consumes: `PackageAssets` from Task 3.
- Produces: deterministic `dist/web`, `assets/migrations`, packaged skills, and packaged integration templates.

- [ ] **Step 1: Write a failing integration test for staged assets.**

From a clean temporary staging directory, run the staging function and assert:

- every canonical SQL migration is copied byte-for-byte into `assets/migrations`
- Vite output exists under `dist/web` with `index.html`
- canonical skills and integration templates are present
- no source maps are shipped unless explicitly required for runtime debugging
- no temporary/user database exists

- [ ] **Step 2: Configure Vite output explicitly to `dist/web`.**

Do not rely on Vite's default directory if another build clean step may remove it. Ensure `pnpm build` cleans once, builds Node, builds web, and stages immutable non-generated assets without deleting an earlier phase's output.

- [ ] **Step 3: Implement deterministic staging.**

`stage-package-assets.ts` must:

1. remove only package-managed staging targets (`assets/migrations`, packaged skill/integration copies if copies are required)
2. create directories
3. copy from canonical repository sources in sorted order
4. reject symlinks and unexpected file types
5. preserve UTF-8 bytes and executable bits only where required
6. never read/write user runtime paths

Prefer shipping canonical `skills/` and `integrations/` directly via the package allowlist when no transformation is needed; copy only migrations because runtime layout intentionally differs.

- [ ] **Step 4: Serve packaged React assets with SPA fallback.**

`createHttpServer` must receive `webRoot`. Serve static files safely, reject path traversal, return `index.html` for client routes, preserve API route precedence, and keep bind host loopback-only.

- [ ] **Step 5: Add version to existing health/diagnostic responses without changing unrelated schemas.**

Inject `applicationVersion` from `readPackageVersion()`. Use the same value for MCP health/server metadata and HTTP/UI diagnostics where existing contracts have a version field or explicitly require one. Do not invent broad new endpoints.

- [ ] **Step 6: Run clean build and packaged asset tests.**

```bash
pnpm build:clean
pnpm build
pnpm test -- tests/integration/packaged-assets.test.ts tests/unit/interfaces/http
```

Expected: PASS and all assets exist at the Task 3 paths.

- [ ] **Step 7: Commit packaged runtime assets.**

```bash
git add vite.config.ts package.json scripts/package/stage-package-assets.ts src/interfaces/http tests/integration/packaged-assets.test.ts
git commit -m "build: stage Relay runtime assets for npm"
```

### Task 6: Define and enforce the tarball allowlist

**Files:**

- Modify: `package.json`
- Create: `scripts/package/package-files.ts`
- Create: `scripts/package/inspect-tarball.ts`
- Create: `tests/integration/package-tarball.test.ts`
- Modify: `.gitignore` if the tarball output needs an ignored deterministic directory

**Interfaces:**

```ts
export const REQUIRED_PACKAGE_PATHS: readonly string[];
export const FORBIDDEN_PACKAGE_PATTERNS: readonly RegExp[];
export function inspectTarball(tarballPath: string): Promise<void>;
```

- [ ] **Step 1: Write the tarball test against the actual `npm pack --json` result.**

The test must build first, run `npm pack --json --pack-destination <temp>`, parse the returned tarball filename, inspect archive entries in sorted form, and fail with a complete required/forbidden diff.

- [ ] **Step 2: Set a positive root `files` allowlist.**

Use exact top-level entries such as:

```json
"files": [
  "dist/",
  "assets/migrations/",
  "skills/",
  "integrations/",
  "README.md",
  "LICENSE",
  "THIRD_PARTY_NOTICES.md"
]
```

Adjust licence/notices filenames to existing canonical files. Do not use a broad negative-only `.npmignore` strategy.

- [ ] **Step 3: Validate required runtime inventory.**

At minimum assert:

- `package/package.json`
- `package/dist/cli/main.js`
- internal MCP/HTTP chunks imported by the bundled executable
- `package/dist/web/index.html`
- at least one hashed web asset
- all migration files
- canonical skill files
- Codex, Claude Code, and generic MCP templates required by the repository contract
- licence/readme/notices

- [ ] **Step 4: Validate forbidden inventory.**

Fail on paths matching source/tests/coverage/git metadata/env files/databases/logs/cache/config/MCPB staging and package tarballs nested inside the package.

- [ ] **Step 5: Add deterministic scripts.**

Add:

```json
"pack:tarball": "pnpm build && npm pack --json --pack-destination .artifacts/npm",
"verify:package:contents": "node --import tsx/esm scripts/package/inspect-tarball.ts",
"verify:package": "node --import tsx/esm scripts/package/smoke-installed-package.ts"
```

The verification scripts may create/remove only ignored `.artifacts/` and OS temporary directories.

- [ ] **Step 6: Run inspection twice and compare inventories.**

```bash
pnpm pack:tarball
pnpm verify:package:contents
pnpm pack:tarball
pnpm verify:package:contents
```

Expected: same normalized inventory and no tracked-file modifications.

- [ ] **Step 7: Commit allowlisting and inspection.**

```bash
git add package.json .gitignore scripts/package/package-files.ts scripts/package/inspect-tarball.ts tests/integration/package-tarball.test.ts
git commit -m "test: enforce Relay npm tarball contents"
```

### Task 7: Smoke-test the installed tarball from an isolated prefix

**Files:**

- Create: `scripts/package/smoke-installed-package.ts`
- Create: `tests/integration/installed-package.test.ts`
- Create: `tests/fixtures/package-smoke/README.md`
- Modify: `package.json` scripts

**Interfaces:**

- Consumes: actual tarball produced in Task 6.
- Produces: one repeatable installed-package gate that proves native addon loading, command routing, shared database resolution, MCP startup, and UI startup outside the checkout.

- [ ] **Step 1: Build a smoke harness that never executes repository-local binaries.**

Create temporary directories for:

- npm prefix
- unrelated working directory
- Relay data/database
- stdout/stderr capture

Install with an npm command equivalent to:

```bash
npm install --global --prefix <prefix> <absolute-tarball-path>
```

Resolve the installed executable from `<prefix>/bin/relay` on POSIX and `<prefix>/relay.cmd` on Windows. Change `cwd` to the unrelated directory before every invocation.

- [ ] **Step 2: Prove native dependency installation by loading it through the installed package.**

Do not merely inspect `node_modules`. Run an installed Relay command that opens/migrates SQLite, then verify success. On failure, stderr must mention `better-sqlite3`, the supported Node/platform contract, and reinstall/rebuild guidance where practical.

- [ ] **Step 3: Exercise the required task/session flow through the installed command.**

Set an absolute temporary `RELAY_DB_PATH` and execute only public commands. Parse existing JSON output schemas and verify:

1. capture a task with workspace, source agent, source context, and session ID
2. list and find the captured task
3. get it by ID
4. list session captures and find it
5. perform one explicit lifecycle mutation allowed by the CLI contract (for example triage `INBOX -> ACTIVE` or complete, using the existing exact command)
6. get/list again and verify persisted state

Do not call application services directly in this test.

- [ ] **Step 4: Verify database precedence and shared resolution across runtimes.**

Start MCP and UI with the same `RELAY_DB_PATH`. Query through their existing public contracts and prove they observe the task created by CLI. Do not infer shared resolution merely because all processes start.

- [ ] **Step 5: Verify MCP startup safely.**

Spawn `relay mcp`, send the minimum valid MCP initialize/handshake frames using the official SDK or existing integration helper, assert the reported application version, and terminate cleanly. Assert stderr may contain diagnostics but stdout contains only MCP protocol frames.

- [ ] **Step 6: Verify UI/API startup safely.**

Spawn `relay ui` with an injectable/ephemeral port if the existing server supports it; otherwise parse the loopback URL emitted to stderr. Assert host is `127.0.0.1`, `::1`, or `localhost`, fetch health/API and `/`, confirm package version and React HTML, then terminate and verify clean shutdown.

- [ ] **Step 7: Verify invalid native/path cases produce actionable failures.**

At minimum test whitespace `RELAY_DB_PATH` and a relative path through the installed command. Expect exit category `2`, machine-readable failure on stdout for normal CLI mode, and concise stderr guidance. Native-addon guidance should be unit-tested by mapping a representative `MODULE_NOT_FOUND`/binary load error rather than corrupting the installation.

- [ ] **Step 8: Ensure cleanup survives assertion failures.**

Use `try/finally` to stop child processes and remove temp directories. Print retained artifact paths only when debugging is explicitly enabled.

- [ ] **Step 9: Run the full installed-package gate.**

```bash
pnpm verify:package
```

Expected: PASS from a clean checkout with no globally installed Relay dependency and no use of repository `node_modules/.bin/relay`.

- [ ] **Step 10: Commit installed execution verification.**

```bash
git add scripts/package/smoke-installed-package.ts tests/integration/installed-package.test.ts tests/fixtures/package-smoke package.json
git commit -m "test: verify Relay from installed npm tarball"
```

### Task 8: Preserve MCPB compatibility and document package operation

**Files:**

- Modify: `scripts/mcpb/stage-linux-mcpb.ts`
- Modify: `scripts/mcpb/verify-linux-mcpb.ts`
- Modify: `tests/integration/mcpb-stage.test.ts`
- Create: `docs/distribution/npm-package.md`
- Modify: `README.md`
- Modify: `scripts/validate-repository-assets.ts`

**Interfaces:**

- Consumes: shared metadata constants, package version source, and built runtime from earlier tasks.
- Produces: clean-checkout proof that npm packaging and Claude Desktop MCPB staging remain compatible but independently validated.

- [ ] **Step 1: Make generated MCPB runtime metadata derive reviewed shared values.**

The staged MCPB package JSON must receive the application version and required native build approvals from the same source used by npm package validation. Keep client-specific fields only in MCPB generation; do not copy MCPB-only fields into root npm metadata.

- [ ] **Step 2: Extend MCPB regression tests.**

Assert:

- generated MCPB runtime package has required `better-sqlite3` build approval
- version matches root package
- required client-specific metadata remains present
- staged runtime loads `better-sqlite3`, not merely contains files
- clean checkout staging needs no manual `package.json` edits

- [ ] **Step 3: Document exact package commands and limits.**

`docs/distribution/npm-package.md` must include:

- `pnpm pack:tarball` and artifact location
- isolated-prefix install command
- invoking `relay` task/session commands, `relay mcp`, and `relay ui`
- immutable versus mutable path behavior
- `RELAY_DB_PATH` absolute-path rule
- supported Node/OS matrix and explicit unsupported platforms
- native addon troubleshooting for Node mismatch, missing build tools, failed `better-sqlite3` load, and clean reinstall
- uninstall retains user data
- no registry publication in issue #40
- manual human review checklist for complete tarball inventory and arbitrary-directory execution

- [ ] **Step 4: Add concise README installation-from-tarball guidance.**

Do not advertise registry installation before publication exists. Link to the detailed distribution document.

- [ ] **Step 5: Run npm and MCPB package checks independently.**

```bash
pnpm verify:package
pnpm build:mcpb
pnpm test:mcpb:stage
```

Expected: all PASS from a clean checkout; neither process depends on uncommitted metadata.

- [ ] **Step 6: Commit compatibility and documentation.**

```bash
git add scripts/mcpb tests/integration/mcpb-stage.test.ts docs/distribution/npm-package.md README.md scripts/validate-repository-assets.ts
git commit -m "docs: verify npm and MCPB package compatibility"
```

### Task 9: Integrate final verification and perform the human review gate

**Files:**

- Modify: `package.json`
- Modify: `.github/workflows/ci.yml` only if the existing CI can safely run the package smoke on its current supported host
- Modify: documentation or tests only for defects found during this gate

**Interfaces:**

- Produces: a reviewable issue #40 implementation with reproducible local evidence. This task does not publish anything.

- [ ] **Step 1: Keep `pnpm verify` non-mutating and include deterministic metadata/content validation.**

Add fast package metadata and built-asset validation to `verify`. Do not put a global-install smoke inside coverage workers if it causes nested build recursion; keep `verify:package` as the explicit packaging gate and run it as a separate CI step when practical.

- [ ] **Step 2: Run all repository quality gates.**

```bash
corepack pnpm install --frozen-lockfile
pnpm verify
pnpm verify:package
pnpm build:mcpb
pnpm test:mcpb:stage
```

Expected: PASS with zero tracked-file changes.

- [ ] **Step 3: Inspect the complete tarball inventory manually.**

Save the normalized inventory in the issue/PR evidence, not as a permanently maintained duplicate manifest unless tests require it. Confirm every required asset and every forbidden category from Task 6.

- [ ] **Step 4: Manually run the installed tarball outside the checkout.**

From a fresh unrelated directory, execute:

```bash
relay <existing-list-command>
relay mcp
relay ui
```

Confirm the command path points to the isolated/global prefix, not the checkout. Confirm CLI/MCP/UI use the same temporary database and UI serves packaged assets.

- [ ] **Step 5: Check platform claims honestly.**

The implementation may merge with automated evidence on the available host, but do not mark Windows x64/macOS arm64/Linux x64 release claims as fully validated unless each has actual native-addon install and runtime evidence. Record missing cross-platform evidence for the future release issue; do not weaken issue #40's local tarball acceptance.

- [ ] **Step 6: Review for accidental scope.**

Confirm the diff does not implement setup, doctor, config mutation, releases, registry publication, installers, daemonization, telemetry, or data deletion.

- [ ] **Step 7: Commit final verification wiring if changed.**

```bash
git add package.json .github/workflows/ci.yml docs tests scripts
 git commit -m "ci: verify installable Relay package"
```

Skip the commit when no tracked files changed.

---

## Mandatory Human Review Checkpoints

1. After Task 1: inspect root and generated MCPB package metadata; confirm one merged `pnpm` object and no npm/MCPB responsibility leakage.
2. After Task 2: inspect exact Windows/macOS/Linux path outputs and rejection of whitespace/relative overrides.
3. After Task 4: review dispatcher boundaries; reject any duplicated task/MCP/HTTP behavior.
4. After Task 6: inspect the full tarball inventory before accepting allowlist changes.
5. After Task 7: confirm smoke tests execute the installed binary from unrelated `cwd` and prove shared database state, not just process startup.
6. Before merge: manually run the tarball outside the checkout and confirm MCP stdout cleanliness and loopback-only UI binding.

## Tests Against Plausible AI-Generated Mistakes

- Package tests fail if `private: true`, `relay-mcp`, duplicate `pnpm`, missing native approvals, or `tmp@0.0.33` returns.
- Path tests mock all platforms and `cwd`; they fail if mutable paths use repository/package/executable directories.
- Asset tests fail if migrations or web files are found only because tests run from repository root.
- Dispatcher tests fail if task argv is re-parsed/reimplemented or MCP writes diagnostics to stdout.
- Tarball tests inspect the actual archive, not the repository build tree.
- Installed smoke tests invoke only the prefix executable and assert it differs from checkout paths.
- SQLite proof executes a real installed command and verifies persisted state.
- MCP/UI smoke tests query state created by CLI, proving the same effective database path.
- MCPB tests load the native addon and verify generated metadata from a clean checkout.
- Final verification asserts `git status --porcelain` is empty after packaging commands.

## Completion Evidence to Add to Issue #40

Luna's completion comment/PR must include:

- tarball filename and package version
- normalized tarball file count and inventory attachment/code block
- isolated prefix and unrelated-`cwd` smoke method
- exact task/session/lifecycle commands exercised
- MCP handshake result and stdout-cleanliness assertion
- UI loopback URL, health/version result, and packaged-index assertion
- effective temporary database path shared by CLI/MCP/UI
- proof `better-sqlite3` loaded from the installed package
- npm package metadata validation result
- MCPB staging/build regression result
- `pnpm verify` and `pnpm verify:package` results
- supported host actually tested, with untested platform claims explicitly called out

## Deferred Decisions

- npm registry publication and trusted publishing workflow
- GitHub Releases and release artifacts
- `relay setup`, `relay doctor`, and config mutation
- standalone binaries and OS-native installers
- broader architecture/platform claims
- automatic update, downgrade support, daemon, telemetry, and destructive data removal
