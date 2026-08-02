# Issue #41 Safe Setup and Agent Configuration Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Implement an idempotent `relay setup` workflow and narrowly scoped `relay config` commands that initialize Relay safely, generate reviewed MCP client snippets, and apply, disable, or remove only provably Relay-owned Codex and Claude Code entries without risking unrelated configuration or task data.

**Architecture:** Add a distribution-level setup/configuration subsystem behind the existing stable `relay` dispatcher. Keep client formats in separate adapters, represent ownership in Relay's own `config.json`, and route every client-file mutation through one preview/backup/atomic-write/validate pipeline. Reuse the existing runtime-path resolver, database migration code, package-version reader, and installed `relay mcp` executable contract; do not duplicate task, MCP, UI, or migration behavior.

**Tech Stack:** Node.js 24 (`>=24 <25`), TypeScript/ESM, pnpm 10.2.0, SQLite with `better-sqlite3`, `@iarna/toml`, `jsonc-parser`, Vitest, existing Relay CLI JSON/error contracts.

## Global Constraints

- Public package name remains `@krishna916/relay`; executable remains `relay`.
- Supported release claims remain Windows x64, macOS arm64, and Linux x64/glibc only.
- Use the existing shared runtime-path resolver; mutable paths must never depend on `cwd`, repository root, executable location, or package installation directory.
- Database precedence remains explicit injected absolute path, non-empty absolute `RELAY_DB_PATH`, then platform default.
- Fresh setup may create the database and run forward migrations, but must never truncate, replace, delete, or reset an existing database.
- `relay setup` is preview-only for client configuration unless `--apply` is explicitly supplied.
- Codex and Claude Code mutation requires `--config-file <absolute-path>`; never auto-discover, scan home directories, traverse parents, or infer scope.
- Generic MCP supports reviewed snippet output only. It must not mutate a generic client file in this issue.
- Installed snippets must invoke `command = "relay"` / `"command": "relay"` with `args = ["mcp"]` / `"args": ["mcp"]`; do not emit source-checkout `node .../dist/mcp/main.js` commands.
- Relay owns only the exact server entry named `relay`; unrelated keys, entries, comments, ordering, indentation, and line endings must be preserved where the client format allows it.
- Command-name similarity alone is not proof of ownership.
- Existing conflicting or ambiguously owned `relay` entries must fail closed with exit code `4` and no file mutation.
- Every client-file mutation requires a collision-safe sibling backup before replacement and a validated atomic sibling-file write.
- If backup, write, replacement, parse validation, or ownership-metadata persistence fails, return an actionable error and leave the original client configuration usable. Preserve the backup.
- Relay ownership metadata must be written only after the client file has been successfully replaced and reparsed.
- Setup, disable, remove, package uninstall, and configuration inspection must retain the SQLite database and all task data.
- Human output may name changed paths, backup paths, owned entry identifiers, and operation types, but must never print unrelated configuration values, environment values, tokens, or secrets.
- JSON mode writes exactly one schema-versioned document plus a newline to stdout; diagnostics remain on stderr.
- `relay mcp` stdout remains MCP-protocol-only.
- Preserve stable exit categories: `0` success, `1` internal, `2` usage/validation, `3` not found, `4` conflict, `5` storage.
- Tests must inject temporary homes, paths, clocks, and files. They must never read or mutate real user configuration or default data paths.
- Doctor diagnostics, registry publication, marketplace installation, MCPB changes, shell-profile/PATH edits, daemonization, auto-update, and destructive data deletion remain out of scope.
- `pnpm verify` and the package verification gate must pass.

---

## Locked User-Facing Command Contract

Implement only this operational surface:

```text
relay setup
relay setup --client codex --config-file <absolute-path> [--apply]
relay setup --client claude-code --config-file <absolute-path> [--apply]
relay setup --client generic-mcp

relay config paths
relay config integrations
relay config snippet --client codex
relay config snippet --client claude-code
relay config snippet --client generic-mcp
relay config disable --client codex --config-file <absolute-path> --apply
relay config disable --client claude-code --config-file <absolute-path> --apply
relay config remove --client codex --config-file <absolute-path> --apply
relay config remove --client claude-code --config-file <absolute-path> --apply
```

Rules:

- `relay setup` without `--client` initializes Relay-owned data/config directories and opens the database through the canonical runtime so migrations run. It performs no client-file mutation.
- Client setup without `--apply` initializes Relay itself and returns an exact preview plus the reviewed snippet. It writes neither the client file nor ownership metadata.
- Client setup with `--apply` mutates only Codex or Claude Code configuration after all safety checks pass.
- `generic-mcp` rejects `--config-file` and `--apply` with exit code `2` because issue #39 approves snippet-only generic support.
- `disable` removes the exact owned entry from the client file but retains its ownership record with status `disabled`, enabling a later safe re-enable through setup.
- `remove` removes the exact owned entry and, after successful file validation, removes that integration record from Relay metadata. It retains database, tasks, backups, and other Relay configuration.
- `disable`/`remove` require `--apply`; omitting it is a usage error rather than an implicit preview command. The user can inspect intended ownership through `relay config integrations` first.
- Existing task/session commands, `relay mcp`, and `relay ui` remain unchanged.

All operational commands must support the existing CLI JSON-mode convention. Do not invent a second output protocol.

---

## Locked Domain Types and File Responsibilities

Create focused modules; use an existing semantically equivalent file instead of duplicating it.

```text
src/distribution/setup/
  setup-types.ts
  initialize-relay.ts
  snippets.ts
  ownership-store.ts
  plan-integration-change.ts
  apply-integration-change.ts
  backup-and-atomic-write.ts
  clients/
    client-adapter.ts
    codex-toml-adapter.ts
    claude-json-adapter.ts

src/interfaces/cli/
  run-relay.ts
  run-operational-command.ts
  parse-operational-command.ts
  operational-output.ts
```

Test/fixture locations:

```text
tests/unit/distribution/setup/
tests/unit/interfaces/cli/operational-commands.test.ts
tests/integration/setup-workflow.test.ts
tests/fixtures/setup/codex/
tests/fixtures/setup/claude-code/
tests/fixtures/setup/metadata/
```

Required types:

```ts
export type IntegrationClient = 'codex' | 'claude-code' | 'generic-mcp';
export type MutableIntegrationClient = Exclude<IntegrationClient, 'generic-mcp'>;
export type IntegrationStatus = 'enabled' | 'disabled';

export interface RelayOwnershipFile {
  readonly schemaVersion: 1;
  readonly integrations: readonly RelayIntegrationOwnership[];
}

export interface RelayIntegrationOwnership {
  readonly client: MutableIntegrationClient;
  readonly configPath: string;
  readonly entryId: 'relay';
  readonly command: 'relay';
  readonly args: readonly ['mcp'];
  readonly status: IntegrationStatus;
  readonly applicationVersion: string;
  readonly lastSuccessfulSetupAt: string;
  readonly lastBackupPath?: string;
}

export type IntegrationOperation = 'created' | 'updated' | 'unchanged' | 'disabled' | 'removed';

export interface IntegrationChangePlan {
  readonly client: MutableIntegrationClient;
  readonly configPath: string;
  readonly entryId: 'relay';
  readonly operation: IntegrationOperation;
  readonly changed: boolean;
  readonly beforeFingerprint: string;
  readonly nextContent: string;
  readonly snippet: string;
}

export interface IntegrationChangeResult {
  readonly client: MutableIntegrationClient;
  readonly configPath: string;
  readonly entryId: 'relay';
  readonly operation: IntegrationOperation;
  readonly changed: boolean;
  readonly backupPath?: string;
}
```

`beforeFingerprint` must be a SHA-256 digest of the exact pre-write bytes and is used to detect a time-of-check/time-of-use race immediately before replacement. It is internal and must not expose configuration content.

---

### Task 1: Add the setup/config domain contracts and representative fixtures

**Files:**

- Create: `src/distribution/setup/setup-types.ts`
- Create: `src/distribution/setup/clients/client-adapter.ts`
- Create: `tests/fixtures/setup/codex/*.toml`
- Create: `tests/fixtures/setup/claude-code/*.json`
- Create: `tests/fixtures/setup/metadata/*.json`
- Create: `tests/unit/distribution/setup/setup-types.test.ts`
- Modify: `scripts/validate-repository-assets.ts`
- Modify: `tests/unit/scripts/validate-repository-assets.test.ts`

**Interfaces:**

```ts
export interface ClientEntryState {
  readonly kind: 'absent' | 'matching' | 'conflicting';
  readonly command?: string;
  readonly args?: readonly string[];
}

export interface ClientConfigAdapter {
  readonly client: MutableIntegrationClient;
  parse(content: string): void;
  inspect(content: string): ClientEntryState;
  upsertRelayEntry(content: string): string;
  removeRelayEntry(content: string): string;
  renderSnippet(): string;
}
```

- [ ] **Step 1: Add failing tests for exact type/fixture expectations.**

Fixtures must include, for both mutable clients:

1. empty/minimal valid file;
2. valid file with unrelated configuration before and after the MCP section;
3. exact installed Relay entry (`relay`, `['mcp']`);
4. conflicting `relay` entry using another command;
5. malformed input;
6. comments and non-default formatting that must survive a Relay edit;
7. CRLF input whose line endings must remain CRLF;
8. an unrelated value resembling a secret, used only to assert it never appears in output/errors.

Metadata fixtures must include empty schema, enabled ownership, disabled ownership, malformed JSON, unsupported `schemaVersion`, duplicate `(client, configPath)` records, and a record whose installed command differs from the locked contract.

- [ ] **Step 2: Run the focused tests and confirm missing contracts/fixtures fail.**

```bash
pnpm test -- tests/unit/distribution/setup/setup-types.test.ts tests/unit/scripts/validate-repository-assets.test.ts
```

Expected: FAIL because setup contracts and required fixtures do not exist.

- [ ] **Step 3: Implement the exact types above and freeze client names/entry identity.**

Do not add client aliases, automatic path fields, arbitrary command arrays, multiple owned entries, or future schema fields.

- [ ] **Step 4: Extend repository validation to require every fixture category and parse valid JSON fixtures.**

Validation must reject machine-specific user paths and must reject source-checkout commands (`node`, `dist/mcp/main.js`, `__RELAY_CHECKOUT__`) in installed setup snippets.

- [ ] **Step 5: Run focused tests and type checking.**

```bash
pnpm test -- tests/unit/distribution/setup/setup-types.test.ts tests/unit/scripts/validate-repository-assets.test.ts
pnpm typecheck
```

Expected: PASS.

- [ ] **Step 6: Commit the contracts and fixtures.**

```bash
git add src/distribution/setup tests/fixtures/setup tests/unit/distribution/setup scripts/validate-repository-assets.ts tests/unit/scripts/validate-repository-assets.test.ts
git commit -m "test: define safe setup configuration contracts"
```

### Task 2: Implement Relay initialization and ownership metadata storage

**Files:**

- Create: `src/distribution/setup/initialize-relay.ts`
- Create: `src/distribution/setup/ownership-store.ts`
- Modify: `src/interfaces/production-dependencies.ts`
- Create: `tests/unit/distribution/setup/initialize-relay.test.ts`
- Create: `tests/unit/distribution/setup/ownership-store.test.ts`

**Interfaces:**

```ts
export interface InitializeRelayDependencies {
  readonly runtimePaths: RuntimePaths;
  readonly openRuntime: (databasePath: string) => { close(): void };
  readonly mkdir: typeof import('node:fs/promises').mkdir;
}

export interface InitializeRelayResult {
  readonly dataRoot: string;
  readonly configRoot: string;
  readonly databasePath: string;
  readonly createdDirectories: readonly string[];
}

export async function initializeRelay(
  dependencies: InitializeRelayDependencies,
): Promise<InitializeRelayResult>;

export interface OwnershipStore {
  read(): Promise<RelayOwnershipFile>;
  write(next: RelayOwnershipFile): Promise<void>;
}

export function createOwnershipStore(input: {
  readonly metadataPath: string;
  readonly applicationVersion: string;
}): OwnershipStore;
```

- [ ] **Step 1: Write failing initialization tests with temporary runtime paths.**

Assert fresh initialization creates only `dataRoot` and `configRoot`, then opens/closes the canonical runtime once so existing migrations create the database. Assert a second run reports no newly created directories and preserves existing task rows.

Also assert a migration/open failure returns a storage-category error, does not delete/replace an existing database, and does not create ownership metadata as a side effect.

- [ ] **Step 2: Write failing ownership-store tests.**

Assert missing `config.json` reads as `{ schemaVersion: 1, integrations: [] }`; malformed JSON, unsupported schema versions, duplicate records, relative config paths, non-`relay` commands, or non-`['mcp']` args fail closed.

Assert writes use a temporary sibling file and atomic rename. The store owns its whole file, so it may serialize deterministic two-space JSON with a trailing newline; it must not read or expose client configuration.

- [ ] **Step 3: Implement initialization by reusing `resolveRuntimePaths()` and the existing production runtime factory.**

Do not call migration SQL directly and do not add a second connection/migration implementation. Ensure opened resources close in `finally`.

- [ ] **Step 4: Implement schema-validated ownership reads/writes.**

Normalize config paths before comparison. Sort records by `client`, then normalized `configPath`, for deterministic output. Reject duplicate normalized keys using platform-appropriate path comparison.

- [ ] **Step 5: Run focused tests plus database migration tests.**

```bash
pnpm test -- tests/unit/distribution/setup/initialize-relay.test.ts tests/unit/distribution/setup/ownership-store.test.ts tests/unit/database
pnpm typecheck
```

Expected: PASS.

- [ ] **Step 6: Commit initialization and metadata storage.**

```bash
git add src/distribution/setup src/interfaces/production-dependencies.ts tests/unit/distribution/setup
git commit -m "feat: initialize Relay and persist integration ownership"
```

### Task 3: Generate the exact installed-command snippets

**Files:**

- Create: `src/distribution/setup/snippets.ts`
- Create: `tests/unit/distribution/setup/snippets.test.ts`
- Modify: `integrations/codex/config.toml.example`
- Modify: `integrations/claude-code/.mcp.json.example`
- Modify: `integrations/generic-mcp/server-config.json.example`
- Modify: relevant integration READMEs and `docs/agent-integration.md`
- Modify: `scripts/validate-agent-integration-assets.ts`
- Modify: its unit tests

**Interfaces:**

```ts
export function renderIntegrationSnippet(client: IntegrationClient): string;
```

Exact semantic snippets:

```toml
[mcp_servers.relay]
command = "relay"
args = ["mcp"]
```

```json
{
  "mcpServers": {
    "relay": {
      "command": "relay",
      "args": ["mcp"]
    }
  }
}
```

Claude Code uses the same JSON object shape already established by its `.mcp.json` fixture. Generic MCP uses the reviewed generic JSON wrapper. No snippet includes `RELAY_DB_PATH` by default; validation-specific isolated database examples remain separate documentation.

- [ ] **Step 1: Write failing snapshot/semantic tests for all three snippets.**

Parse TOML/JSON and assert exact entry name, command, args, trailing newline, no shell-string concatenation, no machine path, no source-checkout path, and no environment values.

- [ ] **Step 2: Run focused tests and asset validation to show current source-checkout templates fail the installed contract.**

```bash
pnpm test -- tests/unit/distribution/setup/snippets.test.ts tests/unit/scripts/validate-agent-integration-assets.test.ts
pnpm validate:assets
```

Expected: FAIL because current templates still invoke `node` plus a checkout path and mark `relay mcp` as future-only.

- [ ] **Step 3: Implement one renderer and update packaged templates from that reviewed contract.**

Avoid three unrelated hard-coded implementations. The adapters may format their native representation, but tests must prove semantic equality with `renderIntegrationSnippet()`.

- [ ] **Step 4: Update integration documentation for the now-available installed command.**

Remove only obsolete “future/not available” wording. Keep source-checkout guidance clearly separated. Preserve client-specific skill installation and data-retention guidance.

- [ ] **Step 5: Update validators to require installed snippets while retaining source-checkout validation where explicitly documented.**

Do not weaken canonical skill, autonomy, secret, or removal-policy checks.

- [ ] **Step 6: Run focused tests and full asset validation.**

```bash
pnpm test -- tests/unit/distribution/setup/snippets.test.ts tests/unit/scripts/validate-agent-integration-assets.test.ts
pnpm validate:assets
```

Expected: PASS.

- [ ] **Step 7: Commit installed integration snippets.**

```bash
git add src/distribution/setup integrations docs/agent-integration.md scripts/validate-agent-integration-assets.ts tests/unit/distribution/setup tests/unit/scripts
git commit -m "feat: generate installed Relay MCP snippets"
```

### Task 4: Implement format-preserving Codex and Claude Code adapters

**Files:**

- Create: `src/distribution/setup/clients/codex-toml-adapter.ts`
- Create: `src/distribution/setup/clients/claude-json-adapter.ts`
- Create: `tests/unit/distribution/setup/codex-toml-adapter.test.ts`
- Create: `tests/unit/distribution/setup/claude-json-adapter.test.ts`
- Modify: `package.json`
- Modify: `pnpm-lock.yaml`

**Interfaces:** Implement `ClientConfigAdapter` exactly.

- [ ] **Step 1: Write failing adapter tests against every fixture.**

For both clients assert:

- malformed input fails before editing;
- absent entry inserts one exact Relay entry;
- exact matching entry returns byte-identical content;
- conflicting entry is reported as `conflicting` and is never overwritten;
- removal deletes only the Relay entry;
- unrelated values/comments/order/indentation/line endings remain byte-identical outside the edited range;
- reparsing edited output succeeds;
- snippets match Task 3 semantics.

- [ ] **Step 2: Add `jsonc-parser` as a production dependency and regenerate the frozen lockfile.**

Use `jsonc-parser` `modify()` plus `applyEdits()` for Claude JSON so indentation, comments, and unrelated content are retained. Do not use `JSON.stringify()` to rewrite the entire client file.

- [ ] **Step 3: Implement the Claude adapter.**

Parse with errors collected; any parse error aborts. Inspect only `mcpServers.relay`. Upsert with exact `{ command: 'relay', args: ['mcp'] }`. Remove only the `relay` property and retain an empty `mcpServers` object rather than speculatively deleting its parent.

- [ ] **Step 4: Implement the Codex adapter with parser validation and narrow text-range editing.**

Use `@iarna/toml` to validate the full document and inspect `mcp_servers.relay`. For mutation, locate the exact `[mcp_servers.relay]` table header and its table range in source text; replace/remove only that range. Insert a new table at EOF with one separating newline. Preserve original newline style. Reject ambiguous duplicate/table representations instead of normalizing the whole TOML file. Do not stringify the entire document because that would discard comments and formatting.

- [ ] **Step 5: Run adapter tests, lint, and type checking.**

```bash
pnpm test -- tests/unit/distribution/setup/codex-toml-adapter.test.ts tests/unit/distribution/setup/claude-json-adapter.test.ts
pnpm lint
pnpm typecheck
```

Expected: PASS.

- [ ] **Step 6: Commit the client adapters.**

```bash
git add package.json pnpm-lock.yaml src/distribution/setup/clients tests/unit/distribution/setup
git commit -m "feat: safely edit supported agent configurations"
```

### Task 5: Implement ownership-aware planning, backups, and atomic application

**Files:**

- Create: `src/distribution/setup/plan-integration-change.ts`
- Create: `src/distribution/setup/backup-and-atomic-write.ts`
- Create: `src/distribution/setup/apply-integration-change.ts`
- Create: `tests/unit/distribution/setup/plan-integration-change.test.ts`
- Create: `tests/unit/distribution/setup/backup-and-atomic-write.test.ts`
- Create: `tests/unit/distribution/setup/apply-integration-change.test.ts`

**Interfaces:**

```ts
export async function planIntegrationChange(input: {
  readonly action: 'setup' | 'disable' | 'remove';
  readonly client: MutableIntegrationClient;
  readonly configPath: string;
  readonly adapter: ClientConfigAdapter;
  readonly ownership: RelayOwnershipFile;
}): Promise<IntegrationChangePlan>;

export async function backupAndAtomicWrite(input: {
  readonly targetPath: string;
  readonly expectedFingerprint: string;
  readonly nextContent: string;
  readonly validate: (content: string) => void;
  readonly now: Date;
}): Promise<{ readonly backupPath: string }>;

export async function applyIntegrationChange(input: {
  readonly plan: IntegrationChangePlan;
  readonly adapter: ClientConfigAdapter;
  readonly ownershipStore: OwnershipStore;
  readonly applicationVersion: string;
  readonly now: Date;
}): Promise<IntegrationChangeResult>;
```

- [ ] **Step 1: Write failing ownership-planning tests.**

Lock these decisions:

- absent entry + setup => `created`;
- exact entry + matching ownership => `unchanged`;
- exact entry without ownership => conflict, even though command/args match;
- conflicting entry => conflict;
- ownership path/client mismatch => conflict;
- disable/remove without enabled ownership => not-found or conflict as appropriate;
- disabled ownership + setup + absent entry => `created` and re-enable;
- enabled ownership + absent entry => conflict because external deletion makes ownership state ambiguous;
- preview performs no writes.

- [ ] **Step 2: Write failing backup/write tests with an injected clock.**

Backup format is exactly:

```text
<filename>.relay-backup-YYYYMMDDTHHMMSSmmmZ
```

Sanitize the ISO timestamp by removing `-` and `:` only. If the candidate exists, append `-1`, `-2`, etc. Assert backup bytes exactly equal original bytes.

Write to a unique sibling temporary file, flush and close it, re-read and validate it, compare the target's current SHA-256 with `expectedFingerprint`, then replace the target atomically. Re-read and validate the replaced target before success.

- [ ] **Step 3: Cover failure ordering explicitly.**

Tests must inject failures for backup creation, temp write, flush/close, pre-replace fingerprint mismatch, rename, post-replace read, parse validation, and metadata write. Assert:

- failures before replacement leave original bytes unchanged;
- fingerprint mismatch never replaces the file;
- backup remains after any post-backup failure;
- metadata is unchanged unless client replacement and post-parse validation succeeded;
- errors contain target/backup path and remediation but not unrelated fixture values.

If post-replacement validation unexpectedly fails, restore the original from the already-created backup through the same atomic primitive, validate the restored file, preserve the backup, and return exit code `5`. If restoration fails, return an explicit storage error naming both paths without printing file contents.

- [ ] **Step 4: Implement plan logic with exact ownership proof.**

The normalized `(client, configPath, entryId)` record plus exact command/args is the proof. Do not infer ownership from executable names, comments, neighboring keys, or a backup filename.

- [ ] **Step 5: Implement application ordering.**

For changed setup/disable/remove:

1. read and plan;
2. create backup;
3. verify no concurrent target change;
4. atomic replace;
5. reparse final client file;
6. atomically update Relay metadata;
7. return exact change report.

For `unchanged`, write neither backup nor metadata timestamp.

- [ ] **Step 6: Run focused safety tests.**

```bash
pnpm test -- tests/unit/distribution/setup/plan-integration-change.test.ts tests/unit/distribution/setup/backup-and-atomic-write.test.ts tests/unit/distribution/setup/apply-integration-change.test.ts
pnpm typecheck
```

Expected: PASS.

- [ ] **Step 7: Commit the safe mutation pipeline.**

```bash
git add src/distribution/setup tests/unit/distribution/setup
git commit -m "feat: apply owned configuration changes atomically"
```

### Task 6: Wire `relay setup` and the approved `relay config` commands

**Files:**

- Create: `src/interfaces/cli/parse-operational-command.ts`
- Create: `src/interfaces/cli/run-operational-command.ts`
- Create: `src/interfaces/cli/operational-output.ts`
- Modify: `src/interfaces/cli/run-relay.ts`
- Modify: `src/interfaces/cli/main.ts`
- Modify: `src/interfaces/production-dependencies.ts`
- Create: `tests/unit/interfaces/cli/operational-commands.test.ts`
- Modify: `tests/unit/interfaces/cli/run-relay.test.ts`

**Interfaces:**

```ts
export type OperationalCommand =
  | {
      readonly kind: 'setup';
      readonly client?: IntegrationClient;
      readonly configFile?: string;
      readonly apply: boolean;
    }
  | { readonly kind: 'config-paths' }
  | { readonly kind: 'config-integrations' }
  | { readonly kind: 'config-snippet'; readonly client: IntegrationClient }
  | {
      readonly kind: 'config-disable' | 'config-remove';
      readonly client: MutableIntegrationClient;
      readonly configFile: string;
      readonly apply: true;
    };

export function parseOperationalCommand(argv: readonly string[]): OperationalCommand;
export async function runOperationalCommand(
  command: OperationalCommand,
  dependencies: OperationalDependencies,
): Promise<number>;
```

- [ ] **Step 1: Write failing parser tests for the locked command grammar.**

Reject duplicate flags, unknown flags, missing values, relative/empty config paths, unsupported client names, generic mutation, generic `--apply`, `--config-file` without a mutable client, and disable/remove without `--apply`.

- [ ] **Step 2: Write failing runner/output tests.**

Assert setup always initializes Relay first. Preview output reports `changed`, operation, exact target path, entry ID, and snippet, but has no backup path. Applied output includes backup path only when changed. `config paths` shows effective data/config/cache/database paths and metadata path. `config integrations` shows only Relay-owned fields and never opens client files. Snippet output contains only the reviewed snippet and envelope metadata.

- [ ] **Step 3: Extend `runRelay()` with thin dispatch only.**

Route `setup` and `config` to `runOperationalCommand()`. Keep task/session, MCP, and UI routes unchanged. Unknown commands remain exit code `2`.

- [ ] **Step 4: Map errors to the existing CLI categories and sanitization rules.**

Usage/path/parse errors => `2`; missing owned integration => `3`; ownership/race/conflict => `4`; filesystem/backup/SQLite/metadata failure => `5`; unexpected defects => `1`.

Do not create parallel error-envelope or JSON serialization logic; reuse existing shared CLI conventions.

- [ ] **Step 5: Run all CLI unit tests and built CLI smoke tests.**

```bash
pnpm test -- tests/unit/interfaces/cli/operational-commands.test.ts tests/unit/interfaces/cli/run-relay.test.ts tests/integration/cli-process.test.ts
pnpm typecheck
```

Expected: PASS.

- [ ] **Step 6: Commit CLI wiring.**

```bash
git add src/interfaces/cli src/interfaces/production-dependencies.ts tests/unit/interfaces/cli
git commit -m "feat: expose safe Relay setup and config commands"
```

### Task 7: Add isolated end-to-end setup, idempotency, removal, and package tests

**Files:**

- Create: `tests/integration/setup-workflow.test.ts`
- Modify: `tests/integration/installed-package.test.ts`
- Modify: `scripts/package/smoke-installed-package.ts`
- Modify: package inventory tests only if newly required runtime files/assets are omitted

- [ ] **Step 1: Add an isolated fresh-setup scenario.**

Use a temporary home/config/data root through injected process environment and an absolute temporary `RELAY_DB_PATH`. Run the built `relay setup`, assert directories/database/migrations exist, capture a task through the installed command, rerun setup, and prove the task remains unchanged.

- [ ] **Step 2: Add Codex preview/apply/idempotency/disable/re-enable/remove coverage.**

Start from a fixture containing unrelated TOML content and comments. Assert preview is byte-preserving; apply creates a backup and one entry; second apply creates no backup and reports unchanged; disable removes only the entry and retains disabled metadata; setup re-enables it safely; remove deletes only the entry and ownership record. At every step query the previously captured task.

- [ ] **Step 3: Add the equivalent Claude Code JSON workflow.**

Include comments/formatting if accepted by the client parser fixture and verify unrelated bytes outside edits remain stable. Prove backups are unique when two real mutations happen within the same injected timestamp.

- [ ] **Step 4: Add negative scenarios.**

Cover malformed client files, conflicting unowned Relay entries, matching-but-unowned entries, config change between preview and apply, read-only directory/write failure, malformed ownership metadata, generic apply rejection, and attempts using relative paths. Assert real home/default config is never touched and secret fixture values never appear in stdout/stderr.

- [ ] **Step 5: Extend installed-tarball smoke.**

From an unrelated `cwd`, run:

```text
relay setup
relay config paths
relay config snippet --client codex
relay config snippet --client claude-code
relay config snippet --client generic-mcp
```

Then apply and remove one temporary Codex or Claude fixture using the installed executable. Verify `relay mcp` still starts with protocol-clean stdout and `relay ui` still starts loopback-only.

- [ ] **Step 6: Run integration/package gates.**

```bash
pnpm build
pnpm test -- tests/integration/setup-workflow.test.ts tests/integration/installed-package.test.ts
pnpm verify:package
```

Expected: PASS.

- [ ] **Step 7: Commit end-to-end verification.**

```bash
git add tests/integration scripts/package
git commit -m "test: verify installed setup and configuration workflows"
```

### Task 8: Update operational documentation and complete the human safety gate

**Files:**

- Modify: `README.md`
- Modify: `docs/distribution/npm-package.md`
- Modify: `docs/agent-integration.md`
- Modify: `docs/troubleshooting-agent-integration.md`
- Modify: client integration READMEs
- Create: `docs/setup-and-configuration.md`
- Modify: repository asset validation/tests as needed

- [ ] **Step 1: Document exact setup commands and preview-first behavior.**

Show fresh initialization, snippet-only generic setup, Codex/Claude preview, explicit `--apply`, path inspection, ownership inspection, disable, re-enable, and remove. State that no command scans for client files and every mutable client path must be absolute.

- [ ] **Step 2: Document safety and retention behavior.**

Explain exact-entry ownership, conflict refusal, backup naming, atomic replacement, actionable failure recovery, unsupported generic mutation, and that setup/disable/remove/uninstall never delete the Relay database or tasks.

- [ ] **Step 3: Document manual before/after verification for each supported mutable client.**

Checklist:

1. copy a real configuration to a disposable path;
2. run preview and inspect target/operation/snippet;
3. run `--apply` against the disposable file;
4. compare unrelated content byte-for-byte outside the owned entry;
5. verify backup opens and equals the pre-change file;
6. rerun setup and confirm no change/no new backup;
7. disable and verify only Relay disappears;
8. re-enable and verify it returns once;
9. remove and verify metadata entry is gone;
10. confirm existing Relay tasks remain queryable.

Do not tell users to test against their only live configuration copy first.

- [ ] **Step 4: Run the complete repository gate.**

```bash
pnpm format
pnpm verify
pnpm verify:package
```

Expected: PASS with no formatting rewrites remaining, no lint warnings, all tests/coverage/build/assets passing, and installed-package smoke passing.

- [ ] **Step 5: Perform plan self-review before opening the PR.**

Check every issue #41 acceptance criterion maps to a completed task. Search the implementation and docs for accidental broad scans, source-checkout snippets in installed templates, full-config logging, non-atomic client writes, generic client mutation, database deletion, and ownership inference from command name.

- [ ] **Step 6: Commit documentation and final validation changes.**

```bash
git add README.md docs integrations scripts/validate-repository-assets.ts tests/unit/scripts
git commit -m "docs: explain safe Relay setup and removal"
```

---

## Required Pull Request Evidence

The PR description must include:

- issue link and this plan path;
- exact command surface implemented;
- `pnpm verify` and `pnpm verify:package` results;
- total test count and coverage summary;
- installed-tarball setup smoke result from an unrelated `cwd`;
- Codex fixture before/after/backup result;
- Claude Code fixture before/after/backup result;
- idempotent rerun evidence showing no second backup;
- conflict/malformed/race failure evidence;
- confirmation that all tests used temporary paths and no real client files/default database were touched;
- confirmation that task data survived setup, disable, re-enable, and remove;
- deviations from this plan, each with rationale;
- the unresolved human review gate for real Codex and Claude Code configuration copies, unless the maintainer has completed it.

## Human Review Checkpoints

1. After Task 3, inspect all three generated snippets and reject any source-checkout path or shell command.
2. After Task 4, inspect format-preservation tests and confirm adapters do not serialize whole user files.
3. After Task 5, inspect failure ordering, backup creation, race detection, restoration behavior, and metadata update ordering.
4. After Task 6, manually review the CLI grammar; reject auto-discovery, implicit mutation, generic mutation, or hidden defaults.
5. Before merge, run the documented disposable-file workflow for Codex and Claude Code and compare before/after/backup files.
6. Before closing #41, query a task created before setup and confirm it survives disable and removal.

## Deferred Decisions

- `relay doctor` diagnostics and repair.
- automatic client discovery or default-path mutation.
- generic client mutation adapters.
- Claude Desktop MCPB setup changes.
- shell completion, PATH/profile editing, installers, registry publication, auto-update, daemon, telemetry.
- destructive user-data deletion.
- backup pruning or retention automation.
- support for additional clients or multiple Relay entries per client file.
