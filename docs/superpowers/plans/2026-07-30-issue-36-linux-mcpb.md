# Issue #36 Linux MCPB Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Produce a reproducible, unsigned Linux MCPB that packages Relay's existing canonical stdio MCP server, proves native SQLite and migration compatibility, installs in Claude Desktop on the maintainer's Linux machine, and preserves user data across restart, update, disable, and removal.

**Architecture:** Keep Relay's existing `dist/mcp/main.js` as the only MCP implementation. Build a disposable `.mcpb/relay` staging package containing the canonical server, package metadata, SQL migrations, a minimal production dependency graph, and a reviewed MCPB manifest; then validate and pack it with the pinned official MCPB CLI. Automated tests exercise the staged tree from unrelated working directories, while a separate human gate records real Claude Desktop Linux evidence before support is claimed.

**Tech Stack:** Node.js 24.x, pnpm 10.2.0, TypeScript 5.9, Vitest 4, tsup 8, official MCP TypeScript SDK 1.29, `better-sqlite3` 13.0.1, MCPB manifest 0.3, `@anthropic-ai/mcpb` 2.1.2, GitHub Actions Ubuntu runner, Markdown, JSON.

## Global Constraints

- Parent epic is #18; issue #36 depends on completed issues #24 and #25.
- Target only Linux and the architecture reported by `process.arch` on the build machine.
- Do not claim compatibility with an untested Linux distribution, libc, architecture, Claude Desktop version, or Node ABI.
- Do not change MCP tool names, schemas, task lifecycle rules, session semantics, provenance, or agent autonomy policy.
- Do not create a Claude-specific MCP server; package `dist/mcp/main.js` unchanged.
- MCP stdout must remain protocol-only; diagnostics and compatibility failures belong on stderr.
- Keep durable SQLite data outside Claude's unpacked extension directory.
- Preserve the existing Linux default database resolution and the explicit `RELAY_DB_PATH` override.
- Do not lower Relay's `>=24 <25` Node requirement in this issue.
- Do not add a daemon, remote MCP transport, authentication, telemetry, Electron, Tauri, Docker-first installation, signing, marketplace publication, or release automation.
- Do not add a pnpm workspace or monorepo only for MCPB packaging.
- Do not add the React build or React runtime dependencies to the MCPB.
- Do not stage databases, SQLite sidecars, `.env` files, logs, source maps, tests, coverage, repository metadata, or development dependencies.
- Normal extension update, disable, and removal must not delete user data.
- `pnpm verify` remains non-mutating and usable outside Linux; Linux MCPB construction is a separate command and CI step.
- Every automated runtime test uses a fresh disposable absolute `RELAY_DB_PATH`.
- The repository currently has no declared top-level licence file. Do not invent a project licence in this issue; record that the artifact is for local compatibility evaluation and retain bundled dependency licence metadata.
- Re-check the official MCPB repository, manifest specification, CLI reference, and Claude Desktop installation guide immediately before implementation. Record the verification date and exact CLI version.

---

## Planned File Map

### Reviewed integration assets

- `integrations/claude-desktop/manifest.json` — reviewed MCPB 0.3 manifest for the canonical Node stdio server.
- `integrations/claude-desktop/package.json` — minimal staged runtime package containing only MCP dependencies.
- `integrations/claude-desktop/pnpm-lock.yaml` — dedicated frozen lockfile for the minimal staged runtime package.
- `integrations/claude-desktop/.mcpbignore` — explicit exclusions in addition to MCPB defaults.
- `integrations/claude-desktop/NOTICE.md` — local-evaluation and third-party dependency notice without inventing a Relay licence.
- `integrations/claude-desktop/README.md` — build, install, update, disable, remove, troubleshoot, and evidence instructions.

### Packaging implementation

- `scripts/mcpb/model.ts` — pure manifest, package, target, path, and artifact-name functions.
- `scripts/mcpb/stage-linux-mcpb.ts` — deterministic staging and production dependency installation.
- `scripts/mcpb/verify-linux-mcpb.ts` — staged inventory, native addon, migrations, MCP discovery, and protocol-cleanliness checks.
- `scripts/mcpb/pack-linux-mcpb.ts` — official CLI validation, packing, info inspection, and artifact result reporting.
- `scripts/validate-mcpb-assets.ts` — repository-source validation that is safe on every operating system.

### Tests

- `tests/unit/scripts/mcpb/model.test.ts` — pure target, manifest, package, and naming tests.
- `tests/unit/scripts/mcpb/stage-linux-mcpb.test.ts` — isolated staging tests with injected command execution.
- `tests/unit/scripts/validate-mcpb-assets.test.ts` — positive and negative source-asset validation tests.
- `tests/integration/mcpb-stage.test.ts` — real Linux staged-package native SQLite and MCP stdio tests.
- `tests/fixtures/mcpb/source-valid/` — minimal valid source-asset fixture for validator tests.

### Documentation and existing files

- `docs/claude-desktop-mcpb-verification.md` — authoritative compatibility evidence and final decision record.
- Modify `package.json` — pin MCPB CLI and add focused scripts.
- Modify `pnpm-lock.yaml` — lock the MCPB CLI development dependency.
- Modify `.gitignore` — ignore staging and generated `.mcpb` artifacts.
- Modify `scripts/validate-repository-assets.ts` — invoke MCPB source validation.
- Modify `tests/unit/scripts/validate-repository-assets.test.ts` — include MCPB assets in aggregate fixtures.
- Modify `.github/workflows/ci.yml` — run Linux MCPB build after the normal verification gate without publishing artifacts.
- Modify `README.md` — add one concise link to the Claude Desktop MCPB guide.

---

### Task 1: Lock the current MCPB contract and minimal runtime package

**Files:**

- Create: `integrations/claude-desktop/manifest.json`
- Create: `integrations/claude-desktop/package.json`
- Create: `integrations/claude-desktop/pnpm-lock.yaml`
- Create: `integrations/claude-desktop/.mcpbignore`
- Create: `integrations/claude-desktop/NOTICE.md`
- Create: `docs/claude-desktop-mcpb-verification.md`
- Modify: `package.json`
- Modify: `pnpm-lock.yaml`
- Modify: `.gitignore`

**Interfaces:**

- Consumes: root Relay version `0.1.0`, Node engine `>=24 <25`, runtime dependency versions from the root lockfile, official MCPB manifest 0.3, and official CLI commands `validate`, `pack`, and `info`.
- Produces: a parseable reviewed manifest, a frozen minimal runtime package, pinned `@anthropic-ai/mcpb@2.1.2`, and stable script names used by later tasks.

- [ ] **Step 1: Verify prerequisites and official sources**

Run:

```bash
 test -f docs/mcp-tools.md
 test -f docs/agent-integration-verification.md
 test -f dist/mcp/main.js || pnpm build:node
 node --version
 pnpm --version
 pnpm view @anthropic-ai/mcpb version
```

Open and record the current contents of:

```text
https://github.com/modelcontextprotocol/mcpb
https://github.com/modelcontextprotocol/mcpb/blob/main/MANIFEST.md
https://github.com/modelcontextprotocol/mcpb/blob/main/CLI.md
https://support.claude.com/en/articles/10949351-getting-started-with-local-mcp-servers-on-claude-desktop
```

Expected on the implementation baseline: Node `v24.x`, pnpm `10.2.0`, MCPB CLI `2.1.2`, manifest version `0.3`, Linux listed as a valid platform, `${__dirname}` supported in `server.mcp_config.args`, and `mcpb validate`, `mcpb pack`, and `mcpb info` documented. If any of those differ, update the plan assumptions in the implementation PR description and use the current official contract rather than remembered syntax.

- [ ] **Step 2: Add the exact MCPB development dependency and script names**

Update root `package.json` with:

```json
{
  "scripts": {
    "build:mcpb:stage": "pnpm build:node && node --import tsx/esm scripts/mcpb/stage-linux-mcpb.ts",
    "validate:mcpb": "mcpb validate .mcpb/relay",
    "verify:mcpb:stage": "node --import tsx/esm scripts/mcpb/verify-linux-mcpb.ts",
    "pack:mcpb": "node --import tsx/esm scripts/mcpb/pack-linux-mcpb.ts",
    "build:mcpb": "pnpm build:mcpb:stage && pnpm validate:mcpb && pnpm verify:mcpb:stage && pnpm pack:mcpb"
  },
  "devDependencies": {
    "@anthropic-ai/mcpb": "2.1.2"
  }
}
```

Merge these fields into the existing object without removing any current script or dependency.

Run:

```bash
pnpm install
```

Expected: root `pnpm-lock.yaml` records `@anthropic-ai/mcpb` exactly at `2.1.2`.

- [ ] **Step 3: Create the reviewed manifest**

Create `integrations/claude-desktop/manifest.json` with:

```json
{
  "manifest_version": "0.3",
  "name": "relay",
  "display_name": "Relay",
  "version": "0.1.0",
  "description": "Local task sidecar for human-AI workflows",
  "long_description": "Relay gives Claude Desktop access to a local personal task queue through the canonical Relay MCP server. Data stays in the user's normal Relay SQLite location unless RELAY_DB_PATH is explicitly configured.",
  "author": {
    "name": "Krishnamurti"
  },
  "repository": {
    "type": "git",
    "url": "https://github.com/krishna916/relay.git"
  },
  "documentation": "https://github.com/krishna916/relay/blob/main/integrations/claude-desktop/README.md",
  "support": "https://github.com/krishna916/relay/issues",
  "server": {
    "type": "node",
    "entry_point": "server/main.js",
    "mcp_config": {
      "command": "node",
      "args": ["${__dirname}/server/main.js"],
      "env": {}
    }
  },
  "tools_generated": true,
  "keywords": ["tasks", "productivity", "local-first", "mcp"],
  "compatibility": {
    "platforms": ["linux"],
    "runtimes": {
      "node": ">=24 <25"
    }
  }
}
```

Do not add static tool descriptions. `tools_generated: true` prevents a second manually maintained copy of the canonical tool contract.

- [ ] **Step 4: Create the minimal runtime package and lockfile**

Create `integrations/claude-desktop/package.json`:

```json
{
  "name": "relay",
  "version": "0.1.0",
  "description": "Relay MCPB runtime package",
  "private": true,
  "type": "module",
  "engines": {
    "node": ">=24 <25"
  },
  "dependencies": {
    "@modelcontextprotocol/sdk": "1.29.0",
    "better-sqlite3": "13.0.1",
    "zod": "4.4.3"
  }
}
```

Generate its dedicated frozen lockfile:

```bash
pnpm --dir integrations/claude-desktop install --lockfile-only
rm -rf integrations/claude-desktop/node_modules
```

Expected: the nested lockfile contains only the dependency graph required by the MCP server and does not include React, React DOM, Vite, Vitest, ESLint, tsup, or other development dependencies.

- [ ] **Step 5: Add exclusions and the local-evaluation notice**

Create `integrations/claude-desktop/.mcpbignore`:

```text
.env
.env.*
*.db
*.db-wal
*.db-shm
*.log
*.map
tests/
coverage/
docs/
.git/
.github/
```

Create `integrations/claude-desktop/NOTICE.md` stating all of the following explicitly:

```text
# Relay Linux MCPB Notice

This unsigned bundle is produced for local compatibility evaluation under issue #36.
The Relay repository does not currently declare a top-level project licence, so this artifact must not be represented as a generally redistributable release.
Bundled third-party packages retain their package metadata and licence files under node_modules.
The bundle contains no user database. Relay stores durable data in its normal per-user Linux data location or at the explicit RELAY_DB_PATH supplied by the user.
Removing the extension does not authorize deleting the Relay database.
```

- [ ] **Step 6: Add generated-output ignores**

Append to `.gitignore`:

```text
.mcpb/
artifacts/*.mcpb
integrations/claude-desktop/node_modules/
```

Keep `integrations/claude-desktop/pnpm-lock.yaml` tracked.

- [ ] **Step 7: Create the verification document skeleton with an honest initial state**

Create `docs/claude-desktop-mcpb-verification.md` with these exact top-level sections:

```markdown
# Claude Desktop Linux MCPB Verification

## Scope and support statement

## Official-source verification

## Build environment

## Bundle contents

## Automated verification

## Claude Desktop installation

## Tool and workflow verification

## Restart and update verification

## Disable and removal verification

## Failures and limitations

## Completion decision
```

Under `Completion decision`, state `UNVERIFIED` until the real Claude Desktop workflow in Task 7 succeeds. Do not pre-fill PASS results.

- [ ] **Step 8: Run static checks and commit**

Run:

```bash
pnpm format
pnpm typecheck
pnpm exec mcpb validate integrations/claude-desktop/manifest.json
```

Expected: formatting and type checking pass; the source manifest validates.

Commit:

```bash
git add package.json pnpm-lock.yaml .gitignore integrations/claude-desktop docs/claude-desktop-mcpb-verification.md
git commit -m "build: define Linux MCPB packaging contract"
```

---

### Task 2: Add pure packaging model functions with tests

**Files:**

- Create: `scripts/mcpb/model.ts`
- Create: `tests/unit/scripts/mcpb/model.test.ts`

**Interfaces:**

- Consumes: root `package.json`, source manifest, source runtime package, `process.platform`, and `process.arch`.
- Produces:
  - `readRelayPackageMetadata(rootDir: string): RelayPackageMetadata`
  - `resolveLinuxMcpbPaths(rootDir: string, arch?: NodeJS.Architecture): LinuxMcpbPaths`
  - `createStagedManifest(source: McpbManifest, relay: RelayPackageMetadata): McpbManifest`
  - `createStagedRuntimePackage(source: RuntimePackage, relay: RelayPackageMetadata): RuntimePackage`
  - `assertLinuxBuildTarget(platform?: NodeJS.Platform): void`
  - `assertRuntimeDependencyParity(rootPackage: RootPackage, runtimePackage: RuntimePackage): void`

- [ ] **Step 1: Write failing model tests**

Create tests covering:

```ts
it('derives a versioned Linux artifact name from the actual architecture', () => {
  const paths = resolveLinuxMcpbPaths('/repo', 'x64');
  expect(paths.stageDir).toBe('/repo/.mcpb/relay');
  expect(paths.artifactPath).toBe('/repo/artifacts/relay-0.1.0-linux-x64.mcpb');
});

it('copies the root version and Node engine into staged metadata', () => {
  const relay = { name: 'relay', version: '0.1.0', nodeEngine: '>=24 <25' };
  expect(createStagedManifest(sourceManifest, relay)).toMatchObject({
    name: 'relay',
    version: '0.1.0',
    compatibility: { platforms: ['linux'], runtimes: { node: '>=24 <25' } },
  });
  expect(createStagedRuntimePackage(sourceRuntimePackage, relay)).toMatchObject({
    name: 'relay',
    version: '0.1.0',
    engines: { node: '>=24 <25' },
  });
});

it('rejects a non-Linux packaging target', () => {
  expect(() => assertLinuxBuildTarget('win32')).toThrow(
    'Linux MCPB packaging requires process.platform=linux; received win32.',
  );
});

it('rejects dependency drift between root and MCPB runtime packages', () => {
  expect(() => assertRuntimeDependencyParity(rootPackage, driftedRuntimePackage)).toThrow(
    'MCPB runtime dependency better-sqlite3 must match the root resolved version 13.0.1.',
  );
});
```

Use temporary fixture directories for `readRelayPackageMetadata`; do not mock `process.cwd()`.

- [ ] **Step 2: Run the focused test and verify failure**

```bash
pnpm vitest run tests/unit/scripts/mcpb/model.test.ts
```

Expected: FAIL because `scripts/mcpb/model.ts` does not exist.

- [ ] **Step 3: Implement the pure model**

Use these public types:

```ts
export interface RelayPackageMetadata {
  readonly name: string;
  readonly version: string;
  readonly nodeEngine: string;
}

export interface LinuxMcpbPaths {
  readonly sourceDir: string;
  readonly stageDir: string;
  readonly artifactsDir: string;
  readonly artifactPath: string;
}

export interface McpbManifest {
  readonly manifest_version: string;
  readonly name: string;
  readonly version: string;
  readonly server: {
    readonly type: string;
    readonly entry_point: string;
    readonly mcp_config: {
      readonly command: string;
      readonly args: readonly string[];
      readonly env: Readonly<Record<string, string>>;
    };
  };
  readonly compatibility?: {
    readonly platforms?: readonly string[];
    readonly runtimes?: Readonly<Record<string, string>>;
  };
  readonly [key: string]: unknown;
}

export interface RuntimePackage {
  readonly name: string;
  readonly version: string;
  readonly type: string;
  readonly engines: { readonly node: string };
  readonly dependencies: Readonly<Record<string, string>>;
  readonly [key: string]: unknown;
}
```

Implementation rules:

- derive the repository version from root `package.json`; never hard-code it in artifact naming;
- require root package name `relay` and a non-empty Node engine;
- force staged manifest platform to exactly `['linux']`;
- keep the manifest's canonical `server.entry_point` and `mcp_config` unchanged;
- compare runtime dependency names and exact resolved versions against root `pnpm-lock.yaml` importer values for `@modelcontextprotocol/sdk`, `better-sqlite3`, and `zod`;
- reject React or React DOM in the MCPB runtime package;
- return new objects without mutating parsed source objects.

- [ ] **Step 4: Run focused tests and type checking**

```bash
pnpm vitest run tests/unit/scripts/mcpb/model.test.ts
pnpm typecheck
```

Expected: PASS with no type errors.

- [ ] **Step 5: Commit**

```bash
git add scripts/mcpb/model.ts tests/unit/scripts/mcpb/model.test.ts
git commit -m "build: add Linux MCPB package model"
```

---

### Task 3: Implement deterministic staging with injected command execution

**Files:**

- Create: `scripts/mcpb/stage-linux-mcpb.ts`
- Create: `tests/unit/scripts/mcpb/stage-linux-mcpb.test.ts`

**Interfaces:**

- Consumes: Task 2 model functions, `dist/mcp/main.js`, `src/database/migrations`, source integration assets, and pnpm.
- Produces:
  - `stageLinuxMcpb(options?: StageLinuxMcpbOptions): Promise<LinuxMcpbPaths>`
  - `CommandRunner(command: string, args: readonly string[], options: CommandOptions): Promise<void>`

- [ ] **Step 1: Write failing staging tests**

Cover these cases with a temporary fake repository and an injected command runner:

```ts
it('creates only the approved staging inventory', async () => {
  const result = await stageLinuxMcpb({ rootDir, platform: 'linux', arch: 'x64', runCommand });

  expect(await listRelativeFiles(result.stageDir)).toEqual(
    expect.arrayContaining([
      'manifest.json',
      'package.json',
      'pnpm-lock.yaml',
      '.mcpbignore',
      'NOTICE.md',
      'server/main.js',
      'src/database/migrations/0001_create_tasks.sql',
    ]),
  );
  expect(runCommand).toHaveBeenCalledWith(
    'pnpm',
    ['install', '--prod', '--frozen-lockfile'],
    expect.objectContaining({ cwd: result.stageDir }),
  );
});

it('cleans stale staging content without touching previous artifacts', async () => {
  await writeFile(join(rootDir, '.mcpb/relay/stale.txt'), 'stale');
  await writeFile(join(rootDir, 'artifacts/keep.txt'), 'keep');

  const result = await stageLinuxMcpb({ rootDir, platform: 'linux', arch: 'x64', runCommand });

  await expect(stat(join(result.stageDir, 'stale.txt'))).rejects.toMatchObject({ code: 'ENOENT' });
  await expect(readFile(join(rootDir, 'artifacts/keep.txt'), 'utf8')).resolves.toBe('keep');
});

it('rejects databases, secrets, maps, logs, tests, and React dependencies', async () => {
  await expect(
    stageLinuxMcpb({ rootDir: unsafeRootDir, platform: 'linux', arch: 'x64', runCommand }),
  ).rejects.toThrow('MCPB source inventory contains prohibited path: .env');
});
```

Also test missing built MCP entry, missing migrations, missing source lockfile, non-Linux target, failed dependency installation, and idempotent repeated staging.

- [ ] **Step 2: Run the focused test and verify failure**

```bash
pnpm vitest run tests/unit/scripts/mcpb/stage-linux-mcpb.test.ts
```

Expected: FAIL because the staging function does not exist.

- [ ] **Step 3: Implement the staging function**

Use:

```ts
export interface CommandOptions {
  readonly cwd: string;
  readonly env?: NodeJS.ProcessEnv;
}

export type CommandRunner = (
  command: string,
  args: readonly string[],
  options: CommandOptions,
) => Promise<void>;

export interface StageLinuxMcpbOptions {
  readonly rootDir?: string;
  readonly platform?: NodeJS.Platform;
  readonly arch?: NodeJS.Architecture;
  readonly runCommand?: CommandRunner;
}

export async function stageLinuxMcpb(options: StageLinuxMcpbOptions = {}): Promise<LinuxMcpbPaths>;
```

Implementation sequence:

1. Resolve `rootDir` absolutely and assert Linux.
2. Read root metadata and assert runtime dependency parity.
3. Verify `dist/mcp/main.js`, at least one `src/database/migrations/*.sql`, and every source integration asset exists.
4. Remove only `.mcpb/relay` recursively.
5. Recreate `server/` and `src/database/migrations/` under the stage.
6. Write staged manifest and runtime package using Task 2 functions.
7. Copy the nested lockfile, `.mcpbignore`, `NOTICE.md`, built MCP entry, and all SQL migration files.
8. Run `pnpm install --prod --frozen-lockfile` with `cwd` set to the stage directory.
9. Scan the finished stage and reject prohibited paths or dependency names.
10. Return the resolved paths and print one concise success line only when invoked as a script.

The default command runner must use `spawn` with `stdio: 'inherit'`, reject non-zero exit codes, and never invoke a shell.

- [ ] **Step 4: Run focused tests and type checking**

```bash
pnpm vitest run tests/unit/scripts/mcpb/stage-linux-mcpb.test.ts
pnpm typecheck
```

Expected: PASS.

- [ ] **Step 5: Perform the first real stage on Linux**

```bash
pnpm build:mcpb:stage
find .mcpb/relay -maxdepth 4 -type f | sort
```

Expected:

- `.mcpb/relay/server/main.js` exists;
- SQL migrations exist under `.mcpb/relay/src/database/migrations/`;
- `.mcpb/relay/node_modules/better-sqlite3/` exists;
- React, React DOM, tests, source maps, databases, and repository metadata are absent.

- [ ] **Step 6: Commit**

```bash
git add scripts/mcpb/stage-linux-mcpb.ts tests/unit/scripts/mcpb/stage-linux-mcpb.test.ts
git commit -m "build: stage Linux MCPB runtime"
```

---

### Task 4: Verify native SQLite, migrations, MCP discovery, and protocol cleanliness

**Files:**

- Create: `scripts/mcpb/verify-linux-mcpb.ts`
- Create: `tests/integration/mcpb-stage.test.ts`

**Interfaces:**

- Consumes: staged server path, official MCP SDK client and stdio transport, Task 3 staging output, and a disposable database.
- Produces:
  - `verifyLinuxMcpbStage(options?: VerifyLinuxMcpbStageOptions): Promise<McpbStageVerification>`
  - structured evidence containing Node version, ABI, platform, architecture, database path, discovered tools, and task/session result.

- [ ] **Step 1: Write the failing real-stage integration test**

Run only on Linux and fail clearly elsewhere:

```ts
const linuxIt = process.platform === 'linux' ? it : it.skip;

linuxIt('runs the staged MCPB server with native SQLite from an unrelated cwd', async () => {
  const verification = await verifyLinuxMcpbStage();

  expect(verification.runtime).toMatchObject({
    node: process.version,
    modulesAbi: process.versions.modules,
    platform: 'linux',
    arch: process.arch,
  });
  expect(verification.tools).toEqual(
    expect.arrayContaining([
      'relay_health',
      'task_capture',
      'task_list',
      'task_get',
      'task_find_similar',
      'session_captures_list',
      'task_edit',
      'task_triage',
      'task_start',
      'task_complete',
      'task_archive',
    ]),
  );
  expect(verification.health).toEqual({ name: 'relay', status: 'ok', version: '0.1.0' });
  expect(verification.capturedTask).toMatchObject({
    createdByType: 'AGENT',
    status: 'INBOX',
    sessionId: 'mcpb-stage-verification',
  });
  expect(verification.sessionCount).toBe(1);
  expect(verification.stdoutDiagnostics).toBe('');
});
```

Add a second test that passes a directory as `RELAY_DB_PATH` and asserts process exit `1`, empty stdout, and an actionable fatal message on stderr.

- [ ] **Step 2: Run the focused test and verify failure**

```bash
pnpm build:mcpb:stage
pnpm vitest run tests/integration/mcpb-stage.test.ts
```

Expected: FAIL because `verifyLinuxMcpbStage` does not exist.

- [ ] **Step 3: Implement staged verification**

Use:

```ts
export interface VerifyLinuxMcpbStageOptions {
  readonly rootDir?: string;
  readonly stageDir?: string;
}

export interface McpbStageVerification {
  readonly runtime: {
    readonly node: string;
    readonly modulesAbi: string;
    readonly platform: NodeJS.Platform;
    readonly arch: NodeJS.Architecture;
  };
  readonly databasePath: string;
  readonly tools: readonly string[];
  readonly health: { readonly name: string; readonly status: string; readonly version: string };
  readonly capturedTask: Readonly<Record<string, unknown>>;
  readonly sessionCount: number;
  readonly stdoutDiagnostics: string;
  readonly stderr: string;
}

export async function verifyLinuxMcpbStage(
  options: VerifyLinuxMcpbStageOptions = {},
): Promise<McpbStageVerification>;
```

Implementation rules:

- create one temporary root containing separate `cwd/` and `data/relay.db` paths;
- launch `node <absolute-stage>/server/main.js` through `StdioClientTransport` with `cwd` set to the unrelated directory;
- pass only an explicit disposable `RELAY_DB_PATH` in addition to inherited environment;
- call `relay_health`, list all tools, capture one task with session `mcpb-stage-verification`, retrieve the exact session, and assert one result;
- verify the database file and `_relay_migrations` table exist by opening the disposable database with the staged `better-sqlite3` dependency, not the repository dependency;
- close the MCP transport and database in `finally` blocks;
- remove the temporary root after evidence is captured;
- capture server stderr separately without interpreting protocol stdout as text logs.

Do not perform user-directed mutation tools in automated staging verification; those remain covered by existing MCP contract tests and the real Claude Desktop human gate.

- [ ] **Step 4: Run focused integration and existing MCP tests**

```bash
pnpm build:mcpb:stage
pnpm verify:mcpb:stage
pnpm vitest run tests/integration/mcpb-stage.test.ts
pnpm vitest run tests/integration/mcp-stdio.test.ts
```

Expected: PASS; no default database is created or modified.

- [ ] **Step 5: Commit**

```bash
git add scripts/mcpb/verify-linux-mcpb.ts tests/integration/mcpb-stage.test.ts
git commit -m "test: verify staged Linux MCPB runtime"
```

---

### Task 5: Pack a versioned unsigned artifact with the official CLI

**Files:**

- Create: `scripts/mcpb/pack-linux-mcpb.ts`
- Modify: `tests/unit/scripts/mcpb/model.test.ts`

**Interfaces:**

- Consumes: Task 2 artifact path, staged directory, and pinned `mcpb` CLI.
- Produces: `artifacts/relay-<version>-linux-<arch>.mcpb` and console evidence from `mcpb info`.

- [ ] **Step 1: Add failing artifact-command tests**

Add tests for a pure command builder exported from `pack-linux-mcpb.ts`:

```ts
expect(createPackCommands(paths)).toEqual([
  { command: 'mcpb', args: ['validate', paths.stageDir] },
  { command: 'mcpb', args: ['pack', paths.stageDir, paths.artifactPath] },
  { command: 'mcpb', args: ['info', paths.artifactPath] },
]);
```

Also assert the artifact path ends in `.mcpb`, contains the root semantic version, contains `linux`, contains the actual architecture, and never contains whitespace or a user-specific absolute path in the filename.

- [ ] **Step 2: Run the focused test and verify failure**

```bash
pnpm vitest run tests/unit/scripts/mcpb/model.test.ts
```

Expected: FAIL because `createPackCommands` does not exist.

- [ ] **Step 3: Implement packing**

Use the same non-shell command runner contract as Task 3. The script must:

1. assert Linux;
2. verify the staged directory exists;
3. create `artifacts/` without deleting unrelated files;
4. remove only the exact target artifact if it already exists;
5. run `mcpb validate <stageDir>`;
6. run `mcpb pack <stageDir> <artifactPath>`;
7. run `mcpb info <artifactPath>`;
8. verify the artifact exists, is non-empty, and starts with ZIP magic bytes `0x50 0x4b`;
9. report the absolute artifact path, byte size, platform, architecture, and Relay version;
10. never sign or publish the artifact.

- [ ] **Step 4: Build the complete artifact**

```bash
pnpm build:mcpb
ls -lh artifacts/*.mcpb
pnpm exec mcpb info artifacts/relay-0.1.0-linux-$(node -p 'process.arch').mcpb
```

Expected: one unsigned versioned Linux artifact is created and inspectable.

- [ ] **Step 5: Commit**

```bash
git add scripts/mcpb/pack-linux-mcpb.ts tests/unit/scripts/mcpb/model.test.ts
git commit -m "build: pack versioned Linux MCPB artifact"
```

---

### Task 6: Add cross-platform source validation and Linux CI proof

**Files:**

- Create: `scripts/validate-mcpb-assets.ts`
- Create: `tests/unit/scripts/validate-mcpb-assets.test.ts`
- Create: `tests/fixtures/mcpb/source-valid/**`
- Modify: `scripts/validate-repository-assets.ts`
- Modify: `tests/unit/scripts/validate-repository-assets.test.ts`
- Modify: `.github/workflows/ci.yml`

**Interfaces:**

- Consumes: checked-in MCPB source assets only; no generated stage or artifact.
- Produces: `validateMcpbAssets(options?: { readonly rootDir?: string }): void` and a Linux CI build gate.

- [ ] **Step 1: Write failing validator tests**

Cover acceptance and one isolated rejection per rule:

```text
require manifest.json, package.json, pnpm-lock.yaml, .mcpbignore, NOTICE.md, README.md
require manifest_version 0.3
require name relay and server entry server/main.js
require command node and ${__dirname}/server/main.js argument
require platforms exactly [linux]
require Node engine exactly equal in root package, source manifest, and runtime package
require source manifest version equal root package version
require runtime dependencies exactly @modelcontextprotocol/sdk, better-sqlite3, and zod
reject React and React DOM runtime dependencies
reject static duplicated tool arrays when tools_generated is true
reject database, secret, log, map, test, or coverage paths in integration assets
require removal wording that preserves the Relay database
require documentation to state unsigned local evaluation and limited Linux evidence
require @anthropic-ai/mcpb exact version 2.1.2 in root devDependencies
require all five MCPB scripts in root package.json
```

- [ ] **Step 2: Run the focused validator test and verify failure**

```bash
pnpm vitest run tests/unit/scripts/validate-mcpb-assets.test.ts
```

Expected: FAIL because the validator does not exist.

- [ ] **Step 3: Implement source validation**

Follow the existing `validate-agent-integration-assets.ts` pattern:

```ts
export interface ValidateMcpbAssetsOptions {
  readonly rootDir?: string;
}

export function validateMcpbAssets(options: ValidateMcpbAssetsOptions = {}): void;
```

Use deterministic filesystem and JSON checks only. Do not run `pnpm`, `node`, `mcpb`, native SQLite, or network commands from repository asset validation.

- [ ] **Step 4: Wire aggregate validation**

Import and call `validateMcpbAssets({ rootDir })` from `scripts/validate-repository-assets.ts`. Update aggregate fixtures so `pnpm validate:assets` verifies the new source assets.

- [ ] **Step 5: Add a separate Linux CI step**

Append after the existing `Run verification gate` step in `.github/workflows/ci.yml`:

```yaml
- name: Build and verify Linux MCPB
  run: pnpm build:mcpb
```

Do not upload or publish the generated artifact. GitHub Actions proves Ubuntu x64 construction only; it does not establish support for the maintainer's Linux distribution or Claude Desktop.

- [ ] **Step 6: Run focused and aggregate checks**

```bash
pnpm vitest run tests/unit/scripts/validate-mcpb-assets.test.ts
pnpm vitest run tests/unit/scripts/validate-repository-assets.test.ts
pnpm validate:assets
pnpm verify
pnpm build:mcpb
```

Expected: every command passes on Linux; `pnpm verify` remains non-mutating.

- [ ] **Step 7: Commit**

```bash
git add scripts/validate-mcpb-assets.ts scripts/validate-repository-assets.ts tests/unit/scripts tests/fixtures/mcpb .github/workflows/ci.yml
git commit -m "ci: validate Linux MCPB packaging"
```

---

### Task 7: Document and perform the real Claude Desktop Linux compatibility gate

**Files:**

- Create: `integrations/claude-desktop/README.md`
- Modify: `docs/claude-desktop-mcpb-verification.md`
- Modify: `README.md`

**Interfaces:**

- Consumes: generated artifact, current Claude Desktop Linux installation, actual extension logs, canonical Relay MCP tool contract, and a deliberate test database path.
- Produces: reproducible human evidence and a truthful PASS, FAIL, or BLOCKED completion decision.

- [ ] **Step 1: Write the operational guide before installation**

`integrations/claude-desktop/README.md` must contain:

1. scope: unsigned, current Linux machine only;
2. prerequisites: Node 24 and pnpm 10.2.0 for building;
3. `pnpm install --frozen-lockfile` and `pnpm build:mcpb` commands;
4. artifact path format;
5. custom extension installation path: Settings → Extensions → Advanced settings → Extension Developer → Install Extension;
6. connector/tool discovery through the chat `+` menu or Developer settings;
7. exact smoke workflow from the steps below;
8. restart and version-incremented update workflow;
9. disable and remove instructions that never delete the database;
10. log inspection and native-addon troubleshooting;
11. Node runtime incompatibility stop condition;
12. tested distribution, architecture, Claude Desktop version, and limitations linked to the verification document.

- [ ] **Step 2: Record the build and host environment before installing**

Run and paste exact outputs into `docs/claude-desktop-mcpb-verification.md`:

```bash
cat /etc/os-release
uname -a
uname -m
node --version
node -p 'JSON.stringify({platform: process.platform, arch: process.arch, modules: process.versions.modules})'
pnpm --version
pnpm exec mcpb --version
sha256sum artifacts/relay-0.1.0-linux-$(node -p 'process.arch').mcpb
```

Also record Claude Desktop version and installation source from the application's About screen or package manager. Do not infer them.

- [ ] **Step 3: Choose a deliberate persistent test database outside the extension**

Use an explicit path for the human test, for example:

```bash
mkdir -p "$HOME/.local/share/relay-mcpb-verification"
printf '%s\n' "$HOME/.local/share/relay-mcpb-verification/relay.db"
```

Configure `RELAY_DB_PATH` through the extension configuration only if the current MCPB host exposes environment configuration for this manifest. If it does not, use Relay's normal Linux default and record the resolved path. In either case, confirm the path is outside Claude's extension installation directory before capturing data.

- [ ] **Step 4: Install and inspect the extension**

In Claude Desktop:

```text
Settings → Extensions → Advanced settings → Extension Developer → Install Extension…
```

Select the generated artifact. Record:

- install result;
- extension status;
- extension unpacked path if visible;
- command and arguments shown in logs;
- Node version and module ABI if logs or process metadata expose them;
- every warning or error exactly.

If the exact Claude-hosted Node version or ABI cannot be established, record it as unknown and do not claim the Node compatibility acceptance item is proven.

- [ ] **Step 5: Verify discovery and health**

Confirm the connector exposes exactly the current canonical tools:

```text
relay_health
task_capture
task_list
task_get
task_find_similar
session_captures_list
task_edit
task_triage
task_start
task_complete
task_archive
```

Call `relay_health` and record its complete result. Confirm no generic `task_update` or `task_set_status` tool appears.

- [ ] **Step 6: Verify capture, exact-session retrieval, and explicit mutation**

Use session ID:

```text
claude-desktop-mcpb-20260730-001
```

Ask Claude to capture:

```text
Title: Verify Relay Linux MCPB persistence
Agent: claude-desktop
Workspace: relay
Source context: issue 36 manual compatibility gate
```

Record the returned task ID and confirm:

- `createdByType` is `AGENT`;
- status is `INBOX`;
- the exact session ID is stored;
- `session_captures_list` returns the task.

Then explicitly direct one mutation:

```text
Move the captured task to ACTIVE.
```

Record the full `task_triage` result and confirm the status is `ACTIVE` with focused change metadata.

- [ ] **Step 7: Verify restart persistence**

Fully quit Claude Desktop, confirm its background process has stopped, restart it, reconnect Relay, retrieve the task by ID, and list the exact session. Confirm the same task and database remain.

- [ ] **Step 8: Verify local update persistence**

Create an incremented local test version by changing both root package version and source manifest version to `0.1.1-mcpb.1` on the test branch, rebuild, and install the new artifact through the supported custom-extension update flow. Do not publish or merge the temporary version bump.

Confirm the existing task remains readable after update. Revert the temporary version change before the implementation branch is finalized.

- [ ] **Step 9: Verify disable and removal preserve data**

Disable Relay in Claude Desktop and confirm the database still exists. Remove only the extension, then verify with the source-checkout CLI against the same database:

```bash
RELAY_DB_PATH="<recorded-absolute-database-path>" \
  node "$(pwd)/dist/cli/main.js" task get "<recorded-task-id>" --output json
```

Replace the two angle-bracket values with the exact recorded absolute path and task ID before running. Expected: the task is returned and remains `ACTIVE`.

Do not delete the database as part of cleanup. If the compatibility database is later removed, treat that as a separate deliberate destructive action after evidence has been reviewed.

- [ ] **Step 10: Write the completion decision**

Set one result in `docs/claude-desktop-mcpb-verification.md`:

- `PASS` only when install, discovery, health, capture, exact-session retrieval, explicit mutation, restart, update, removal, and retained-data checks all succeed;
- `BLOCKED` when Claude's bundled runtime or Linux host prevents execution and the exact evidence is recorded;
- `FAIL` when Relay packaging is incorrect or data safety is violated.

A BLOCKED or FAIL result must not be softened into Linux support. Create a separate decision issue only if lowering Node support, changing native SQLite packaging, or abandoning MCPB needs review.

- [ ] **Step 11: Link from the root README and commit evidence**

Add one concise line to `README.md` linking to `integrations/claude-desktop/README.md` and the verification document.

Run:

```bash
pnpm format:check
pnpm validate:assets
```

Commit:

```bash
git add integrations/claude-desktop/README.md docs/claude-desktop-mcpb-verification.md README.md
git commit -m "docs: record Claude Desktop Linux MCPB verification"
```

---

### Task 8: Final clean verification and issue handoff

**Files:**

- Modify only files required to correct failures found by final verification.
- Comment on GitHub issue #36 with the implementation PR, artifact evidence, verification document, and completion decision.

**Interfaces:**

- Consumes: all previous tasks and human evidence.
- Produces: reviewable final proof without publishing an artifact or deleting data.

- [ ] **Step 1: Verify from a clean frozen install on Linux**

Run:

```bash
rm -rf node_modules dist coverage .mcpb artifacts
corepack enable
corepack pnpm install --frozen-lockfile
corepack pnpm verify
corepack pnpm build:mcpb
corepack pnpm exec mcpb info artifacts/relay-0.1.0-linux-$(node -p 'process.arch').mcpb
git status --short
```

Expected:

- `pnpm verify` passes;
- Linux MCPB stage, validation, native SQLite verification, pack, and info pass;
- only ignored `.mcpb/` and `.mcpb` artifact outputs are generated;
- tracked files are unchanged by verification.

- [ ] **Step 2: Review the bundle inventory manually**

Inspect `.mcpb/relay` and confirm:

```text
manifest.json
package.json
pnpm-lock.yaml
.mcpbignore
NOTICE.md
server/main.js
src/database/migrations/*.sql
node_modules with production MCP dependencies only
```

Explicitly search for prohibited material:

```bash
find .mcpb/relay -type f \( \
  -name '*.db' -o -name '*.db-wal' -o -name '*.db-shm' -o \
  -name '.env' -o -name '.env.*' -o -name '*.log' -o -name '*.map' \
\) -print
find .mcpb/relay -type d \( -name tests -o -name coverage -o -name .git \) -print
```

Expected: no output.

- [ ] **Step 3: Review AI-generated risk points**

Human reviewer must inspect:

1. source and staged manifest command/args;
2. package-root discovery from `server/main.js`;
3. migration path and checksums;
4. exact production dependency inventory;
5. native `better-sqlite3` binary platform, architecture, and ABI;
6. MCP stdout/stderr separation;
7. database path outside extension installation;
8. update and removal evidence;
9. absence of altered MCP contracts or Node compatibility;
10. truthful compatibility wording.

- [ ] **Step 4: Comment on issue #36**

Post:

```markdown
Implementation plan executed: `docs/superpowers/plans/2026-07-30-issue-36-linux-mcpb.md`

Evidence:

- implementation PR: <PR link>
- verification record: `docs/claude-desktop-mcpb-verification.md`
- tested artifact: `<exact filename and SHA-256>`
- environment: `<distribution, architecture, Claude Desktop version, Node runtime/ABI>`
- completion decision: `<PASS, BLOCKED, or FAIL>`

No artifact was published, no MCP contract was changed, and extension removal preserved the recorded Relay database.
```

Replace each bracketed evidence field with the exact recorded value before posting.

- [ ] **Step 5: Final commit if verification required corrections**

```bash
git add <only-the-corrected-files>
git commit -m "fix: address Linux MCPB verification findings"
```

Do not create an empty final commit.

---

## Plan Self-Review

- Every issue #36 acceptance criterion maps to Tasks 1–8.
- Canonical MCP behaviour stays in the existing server and contract tests.
- Native SQLite is proven through the staged dependency tree, not the repository dependency tree alone.
- Migration discovery is tested from an unrelated working directory.
- Generated artifacts and user databases remain untracked and outside the extension package.
- Cross-platform `pnpm verify` remains separate from Linux-only packaging.
- CI proves only Ubuntu x64 packaging and does not replace real Claude Desktop evidence.
- The plan does not invent a Relay licence or claim public distribution rights.
- The plan requires an honest PASS, BLOCKED, or FAIL result rather than assuming Linux MCPB compatibility.
