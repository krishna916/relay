# Issue #39 Distribution, Filesystem, and Lifecycle Contracts Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Define and verify one authoritative, publishable distribution contract for Relay across Windows x64, macOS arm64, and Linux x64 without implementing package publication, setup, doctor, or real user-configuration mutation.

**Architecture:** Add a distribution ADR as the single source of truth, derive focused operational documents and machine-readable fixtures from it, and extend repository-asset validation so contract drift fails CI. Keep issue #39 contract-only: production command dispatch, package publication, filesystem mutation, and client configuration editing belong to later issues.

**Tech Stack:** Markdown ADRs and operational documentation, TypeScript contract fixtures, Node.js 24, Vitest, existing repository asset validation, pnpm.

## Global Constraints

- Final npm package name: `@krishna916/relay`.
- Final executable name: `relay`; remove `relay-mcp` from the public distribution contract and route MCP through `relay mcp` in the later packaging issue.
- Supported Node major: Node.js 24 only, expressed as `>=24 <25`.
- Initial supported runtime matrix: Windows x64, macOS arm64, and Linux x64 only.
- Do not claim Windows arm64, macOS x64, Linux arm64, Alpine/musl, or broad Linux distribution compatibility.
- One application version covers CLI, MCP contracts, database migrations, UI assets, skills, and integration assets.
- Production data/config/cache/log paths never depend on the current working directory.
- `RELAY_DB_PATH` is the only database-path environment override in the MVP contract.
- Normal package uninstall, client disable, and integration removal retain Relay data.
- Downgrades are unsupported after a newer version has opened or migrated the database.
- Publication occurs only through an explicit maintainer-triggered release workflow; pushes and merges never publish automatically.
- No production packaging commands, setup implementation, doctor implementation, real configuration editing, installers, daemons, telemetry, or speculative distribution mechanisms.
- Preserve the existing source-checkout task command contracts and stable CLI exit codes.
- `pnpm verify` must pass without weakening coverage, lint, audit, or asset-validation gates.

---

## Locked Contract Decisions

Luna must copy these decisions into the ADR and derived documentation exactly. Do not revisit them during implementation.

### Package and executable

- npm package: `@krishna916/relay`
- user-facing executable: `relay`
- installation form planned for later issue: `npm install --global @krishna916/relay`
- operational invocation examples: `relay setup`, `relay mcp`, `relay ui`, `relay doctor`, `relay config`
- existing task/session commands remain under the same `relay` executable and are not renamed by this issue
- the existing `relay-mcp` bin may remain temporarily in source checkout until the packaging implementation issue migrates clients; issue #39 documents it as transitional and not part of the final public contract

### Supported platform matrix

| Operating system | Architecture | Status      | Evidence required before release                                                                                             |
| ---------------- | ------------ | ----------- | ---------------------------------------------------------------------------------------------------------------------------- |
| Windows 10/11    | x64          | Supported   | clean global install, native dependency load, setup dry-run/fixture validation, MCP stdio smoke test, UI loopback smoke test |
| macOS 13+        | arm64        | Supported   | same evidence on Apple Silicon                                                                                               |
| Linux            | x64, glibc   | Supported   | same evidence on at least Ubuntu LTS; claims remain limited to glibc-compatible x64 Linux                                    |
| Windows          | arm64        | Unsupported | no release claim                                                                                                             |
| macOS            | x64          | Unsupported | no release claim                                                                                                             |
| Linux            | arm64        | Unsupported | no release claim                                                                                                             |
| Alpine/musl      | any          | Unsupported | `better-sqlite3` compatibility is not claimed                                                                                |

### Operational command responsibilities

- `relay setup`: idempotently initialize Relay-owned directories/metadata and prepare or update explicitly selected client integrations; never delete data; always report exact changes; later issue implements it.
- `relay mcp`: start the canonical stdio MCP server; stdout is protocol-only; diagnostics go to stderr.
- `relay ui`: start the local HTTP/UI process on loopback only; no daemonization or startup registration.
- `relay doctor`: perform read-only diagnostics by default; any repair mode requires a future explicit flag and separate contract.
- `relay config`: display effective paths, version, supported matrix, and integration ownership metadata; mutations require explicit subcommands in a later issue.
- uninstall guidance is documentation, not a `relay uninstall` command in MVP.

### Stable operational exit categories

Reuse the existing CLI categories:

| Code | Category         | Operational meaning                                                                                                     |
| ---- | ---------------- | ----------------------------------------------------------------------------------------------------------------------- |
| `0`  | success          | command completed, including idempotent no-change outcomes                                                              |
| `1`  | internal         | unexpected Relay defect or uncategorized failure                                                                        |
| `2`  | usage/validation | invalid arguments, unsupported platform, invalid configuration, incompatible requested operation                        |
| `3`  | not found        | requested Relay-owned integration entry or resource is absent where absence is an error                                 |
| `4`  | conflict         | unsafe overwrite, ownership mismatch, incompatible existing entry, unsupported downgrade, or migration/version conflict |
| `5`  | storage          | filesystem, permission, SQLite, backup, or persistence failure                                                          |

Stdout/stderr rules:

- human mode: successful results and exact change reports to stdout; diagnostics and failures to stderr
- JSON mode: exactly one schema-versioned JSON document plus newline on stdout; diagnostics remain on stderr and must not corrupt JSON
- `relay mcp`: all MCP protocol frames on stdout; every log/diagnostic on stderr
- secrets, full prompts, and full config contents must never be echoed in change reports

### Filesystem defaults and precedence

All paths are per-user and resolved by one future shared resolver. Directory names are lowercase `relay` except macOS application-support conventions.

| Purpose             | Windows                                                           | macOS                                                             | Linux                                                             |
| ------------------- | ----------------------------------------------------------------- | ----------------------------------------------------------------- | ----------------------------------------------------------------- |
| data root           | `%LOCALAPPDATA%\Relay`                                            | `~/Library/Application Support/Relay`                             | `${XDG_DATA_HOME:-~/.local/share}/relay`                          |
| database            | `<data-root>\relay.db`                                            | `<data-root>/relay.db`                                            | `<data-root>/relay.db`                                            |
| Relay config root   | `%APPDATA%\Relay`                                                 | `~/Library/Application Support/Relay/config`                      | `${XDG_CONFIG_HOME:-~/.config}/relay`                             |
| Relay metadata file | `<config-root>\config.json`                                       | `<config-root>/config.json`                                       | `<config-root>/config.json`                                       |
| cache root          | `%LOCALAPPDATA%\Relay\Cache`                                      | `~/Library/Caches/Relay`                                          | `${XDG_CACHE_HOME:-~/.cache}/relay`                               |
| diagnostic logs     | disabled by default; when explicitly enabled, `<cache-root>\logs` | disabled by default; when explicitly enabled, `<cache-root>/logs` | disabled by default; when explicitly enabled, `<cache-root>/logs` |

Database precedence, highest first:

1. explicit in-process path supplied by test/internal dependency injection
2. non-empty `RELAY_DB_PATH`
3. platform default database path

Additional rules:

- empty or whitespace-only `RELAY_DB_PATH` is a validation error, not a request for the default
- relative `RELAY_DB_PATH` values are rejected for installed/public operation; tests may use explicit absolute temporary paths
- `cwd`, repository root, executable directory, and package installation directory never influence mutable data/config/cache/log paths
- immutable package assets resolve relative to the installed module using `import.meta.url`/`fileURLToPath`, never `cwd`
- no general `RELAY_HOME` override in MVP; it creates ambiguous partial relocation and is deferred

### Client configuration ownership

Relay owns only identifiable exact entries/fragments and never rewrites an entire client configuration.

- Codex: own one exact MCP server entry named `relay`; preserve every unrelated key and server entry.
- Claude Code: own one exact MCP server entry named `relay`; preserve every unrelated key and server entry.
- Generic clients: generate/print a documented fragment by default; mutate a file only when a later client-specific adapter has an explicit parser, ownership rule, and backup contract.
- Claude Desktop MCPB remains a separate client-specific distribution proof and is not merged into npm setup ownership.
- Relay metadata records client kind, config path, owned entry identifier, package/application version, installed command/args, backup reference, and last successful setup timestamp.
- An existing `relay` entry is updated only when it is provably Relay-owned or exactly matches a previously recorded Relay entry.
- An unowned/conflicting `relay` entry causes exit code `4`; Relay reports the conflict and makes no mutation.
- Never infer ownership from command name alone.

### Setup idempotency and backups

- Running setup repeatedly with the same desired state returns success with `changed: false` and writes nothing.
- Before every real client-config mutation, create a sibling timestamped backup using the pattern `<filename>.relay-backup-YYYYMMDDTHHMMSSZ`.
- Write through a temporary sibling file, flush/close it, then atomically replace the original where supported.
- Parse and validate the post-write file before reporting success.
- If validation or replacement fails, preserve the backup, report exit code `5`, and do not update Relay ownership metadata.
- Exact change reports list file path, backup path, owned entry identifier, and operation (`created`, `updated`, `unchanged`, `removed`), but redact secrets and unrelated config content.
- Setup never initializes, truncates, replaces, or deletes an existing database.

### Lifecycle guarantees

- Upgrade: retain database and Relay metadata; run forward-only SQL migrations before serving commands; immutable package assets are replaced by the package manager.
- Migration failure: abort startup/command, leave the original database intact to the extent guaranteed by transactional migration boundaries, and report storage/conflict category as appropriate.
- Downgrade: unsupported once a newer application/migration version has opened the database; fail closed with exit code `4` and remediation guidance to reinstall the newer version or restore a user-created backup.
- Disable: remove/disable only the owned client entry; keep package, database, metadata, and backups.
- Integration removal: remove only the exact owned entry after a fresh backup; keep package and all user data.
- Package uninstall: removes package-managed files only; client config may require prior integration removal; user data/config/cache remain.
- Destructive data deletion: separate future explicit action, never part of npm uninstall or normal integration removal; must name target paths and require an interactive confirmation or explicit non-interactive acknowledgement.
- Backups are user data and are not automatically deleted by uninstall.

### Version compatibility

- npm package version is the application version and applies to CLI, MCP, UI, skills, integration templates, and package assets.
- MCP/CLI payload schema versions remain independently versioned contract fields; application version changes do not automatically change schema versions.
- database migration state is stored in the migration table and compared with the application-supported migration range.
- package assets contain or derive from the same package version; validation rejects hard-coded divergent versions.
- setup records the application version that last wrote each owned integration entry.
- patch/minor upgrades must preserve documented command and schema compatibility unless a migration/contract decision explicitly states otherwise.
- major-version compatibility policy is deferred until a breaking release is proposed.

### Release approval

- No publish-on-push and no publish-on-merge.
- A maintainer explicitly triggers the future release workflow with a version/tag input after reviewing CI and platform evidence.
- The workflow verifies the tag/version match, frozen install, `pnpm verify`, package contents, and supported-platform evidence before npm publication.
- npm provenance and trusted publishing should be used when implemented, but issue #39 only records the policy.
- Failed or partial platform evidence blocks a release claim for that platform; do not silently broaden or retain stale claims.

---

### Task 1: Add the authoritative distribution decision record

**Files:**

- Create: `docs/decisions/0002-distribution-filesystem-and-lifecycle.md`
- Test: `tests/unit/contracts/distribution-contract.test.ts`

**Interfaces:**

- Consumes: issue #39, `docs/decisions/0001-product-and-architecture.md`, current package metadata, existing CLI exit codes, and the locked decisions above.
- Produces: accepted ADR sections with stable headings that derived docs and validation tests can reference.

- [ ] **Step 1: Write a failing ADR contract test.**

Create `tests/unit/contracts/distribution-contract.test.ts` that reads the ADR and checks for the locked identifiers and forbidden claims.

```ts
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { describe, expect, it } from 'vitest';

const adrPath = resolve('docs/decisions/0002-distribution-filesystem-and-lifecycle.md');

describe('distribution ADR', () => {
  it('locks package, runtime, platform, path, lifecycle, and release decisions', () => {
    const adr = readFileSync(adrPath, 'utf8');
    for (const required of [
      '@krishna916/relay',
      '`relay`',
      'Node.js 24',
      'Windows x64',
      'macOS arm64',
      'Linux x64',
      'RELAY_DB_PATH',
      'Downgrades are unsupported',
      'Normal uninstall retains user data',
      'explicit maintainer-triggered release',
    ]) {
      expect(adr).toContain(required);
    }
    expect(adr).toContain('Status: Accepted');
    expect(adr).not.toMatch(/supported.*(Windows arm64|macOS x64|Linux arm64)/i);
  });
});
```

- [ ] **Step 2: Run the focused test and confirm it fails because ADR 0002 does not exist.**

Run: `pnpm test -- tests/unit/contracts/distribution-contract.test.ts`

Expected: FAIL with `ENOENT` for `docs/decisions/0002-distribution-filesystem-and-lifecycle.md`.

- [ ] **Step 3: Create the ADR using the locked decisions.**

Use these exact top-level sections:

```md
# Relay Distribution, Filesystem, and Lifecycle Contract

**Status:** Accepted  
**Date:** 2026-08-01

## Context

## Decision Summary

## Package and Executable

## Supported Runtime Matrix

## Operational Command Surface

## Exit Codes and Output Channels

## Filesystem and Path Resolution

## Client Configuration Ownership

## Setup Idempotency and Backups

## Upgrade, Downgrade, Disable, Removal, and Retention

## Package Asset Resolution

## Version Compatibility

## Publication Approval

## Consequences

## Explicitly Deferred
```

Copy the tables and rules from **Locked Contract Decisions** without weakening them. In `Consequences`, state that `src/database/database-config.ts` currently differs on Windows data-root selection and empty `RELAY_DB_PATH`; reconciliation is implementation work for a later packaging/path-resolver issue, not this contract-only issue.

- [ ] **Step 4: Re-run the ADR test and inspect the diff for accidental implementation scope.**

Run: `pnpm test -- tests/unit/contracts/distribution-contract.test.ts`

Expected: PASS. Confirm no production TypeScript file or `package.json` was changed.

- [ ] **Step 5: Commit the ADR and its contract test.**

```bash
git add docs/decisions/0002-distribution-filesystem-and-lifecycle.md tests/unit/contracts/distribution-contract.test.ts
git commit -m "docs: define Relay distribution contract"
```

### Task 2: Add machine-readable platform, path, command, and lifecycle fixtures

**Files:**

- Create: `tests/fixtures/distribution/supported-platforms.json`
- Create: `tests/fixtures/distribution/path-resolution.json`
- Create: `tests/fixtures/distribution/operational-commands.json`
- Create: `tests/fixtures/distribution/client-config-ownership.json`
- Create: `tests/fixtures/distribution/lifecycle-policy.json`
- Modify: `tests/unit/contracts/distribution-contract.test.ts`

**Interfaces:**

- Consumes: ADR 0002 locked values.
- Produces: deterministic fixtures for later setup, doctor, path-resolver, packaging, and cross-platform tests.

- [ ] **Step 1: Extend the failing test to load and validate all five fixtures.**

Use local Zod schemas inside the test; do not introduce production types for contract-only fixtures.

```ts
const platformSchema = z.object({
  nodeMajor: z.literal(24),
  supported: z.array(
    z.object({
      platform: z.enum(['win32', 'darwin', 'linux']),
      arch: z.enum(['x64', 'arm64']),
      libc: z.enum(['n/a', 'glibc']),
    }),
  ),
  unsupported: z.array(z.object({ platform: z.string(), arch: z.string(), reason: z.string() })),
});

expect(platformSchema.parse(platformFixture).supported).toEqual([
  { platform: 'win32', arch: 'x64', libc: 'n/a' },
  { platform: 'darwin', arch: 'arm64', libc: 'n/a' },
  { platform: 'linux', arch: 'x64', libc: 'glibc' },
]);
```

Also assert command names equal `['setup', 'mcp', 'ui', 'doctor', 'config']`, exit codes equal `[0, 1, 2, 3, 4, 5]`, `RELAY_DB_PATH` is the sole database environment override, uninstall retains data, and downgrade support is `false`.

- [ ] **Step 2: Run the test and confirm it fails for missing fixtures.**

Run: `pnpm test -- tests/unit/contracts/distribution-contract.test.ts`

- [ ] **Step 3: Create exact fixtures.**

`path-resolution.json` must represent variables rather than machine-specific expanded home directories:

```json
{
  "databasePrecedence": ["explicit-in-process", "RELAY_DB_PATH", "platform-default"],
  "databaseEnvironmentOverrides": ["RELAY_DB_PATH"],
  "rejectRelativeDatabaseOverride": true,
  "platforms": {
    "win32": {
      "dataRoot": "%LOCALAPPDATA%\\Relay",
      "database": "%LOCALAPPDATA%\\Relay\\relay.db",
      "configRoot": "%APPDATA%\\Relay",
      "cacheRoot": "%LOCALAPPDATA%\\Relay\\Cache"
    },
    "darwin": {
      "dataRoot": "~/Library/Application Support/Relay",
      "database": "~/Library/Application Support/Relay/relay.db",
      "configRoot": "~/Library/Application Support/Relay/config",
      "cacheRoot": "~/Library/Caches/Relay"
    },
    "linux": {
      "dataRoot": "${XDG_DATA_HOME:-~/.local/share}/relay",
      "database": "${XDG_DATA_HOME:-~/.local/share}/relay/relay.db",
      "configRoot": "${XDG_CONFIG_HOME:-~/.config}/relay",
      "cacheRoot": "${XDG_CACHE_HOME:-~/.cache}/relay"
    }
  },
  "logsEnabledByDefault": false,
  "assetBase": "installed-module-url",
  "cwdAffectsResolution": false
}
```

`client-config-ownership.json` must include the owned entry name `relay`, backup filename pattern, conflict exit code `4`, and `mutateGenericByDefault: false`.

`lifecycle-policy.json` must include `normalUninstallRetainsData: true`, `integrationRemovalRetainsData: true`, `downgradeSupported: false`, `destructiveDeleteSeparateAction: true`, and `automaticPublish: false`.

- [ ] **Step 4: Re-run focused tests and verify fixtures contain no absolute developer paths.**

Run: `pnpm test -- tests/unit/contracts/distribution-contract.test.ts`

Expected: PASS. Search fixture output for the repository path or user home and confirm no match.

- [ ] **Step 5: Commit the fixtures.**

```bash
git add tests/fixtures/distribution tests/unit/contracts/distribution-contract.test.ts
git commit -m "test: add distribution contract fixtures"
```

### Task 3: Write the operational CLI and filesystem contracts

**Files:**

- Create: `docs/distribution/operational-cli-contract.md`
- Create: `docs/distribution/filesystem-contract.md`
- Create: `docs/distribution/supported-platforms.md`
- Modify: `tests/unit/contracts/distribution-contract.test.ts`

**Interfaces:**

- Consumes: ADR 0002 and fixtures from Task 2.
- Produces: implementation-facing command, output, path, platform, and asset-resolution documentation for later issues.

- [ ] **Step 1: Add failing document assertions.**

Assert each document exists, links to ADR 0002, and contains its fixture-backed contract. Include checks that:

- operational doc names exactly five operational commands and states task commands remain unchanged
- filesystem doc includes every platform path, precedence order, absolute override requirement, and `import.meta.url`
- platform doc distinguishes supported, unsupported, and evidence-required states

- [ ] **Step 2: Run focused tests and confirm missing-document failures.**

Run: `pnpm test -- tests/unit/contracts/distribution-contract.test.ts`

- [ ] **Step 3: Create `operational-cli-contract.md`.**

Use sections:

```md
# Operational CLI Contract

## Scope and Relationship to Task Commands

## Installation Identity

## Command Responsibilities

## Exit-Code Categories

## Stdout and Stderr Rules

## Human Output

## JSON Output

## MCP Protocol Cleanliness

## Explicitly Deferred Flags and Commands
```

Document expected later JSON envelope fields for operational commands without implementing them:

```ts
type OperationalResult = {
  schemaVersion: 1;
  ok: boolean;
  command: 'setup' | 'ui' | 'doctor' | 'config';
  changed?: boolean;
  changes?: readonly {
    path: string;
    operation: 'created' | 'updated' | 'unchanged' | 'removed';
    ownedEntry?: string;
    backupPath?: string;
  }[];
  error?: { code: string; message: string };
};
```

State that `relay mcp` does not use this envelope because it speaks MCP over stdio.

- [ ] **Step 4: Create `filesystem-contract.md` and `supported-platforms.md`.**

The filesystem document must provide worked examples for one username-neutral path per OS, explain environment-variable fallbacks, prohibit `cwd`, and separate mutable user paths from immutable package assets.

The platform document must describe the evidence checklist and explicitly say that successful execution on one Linux distribution does not justify all-distribution compatibility.

- [ ] **Step 5: Re-run tests, then commit the documents.**

Run: `pnpm test -- tests/unit/contracts/distribution-contract.test.ts`

```bash
git add docs/distribution tests/unit/contracts/distribution-contract.test.ts
git commit -m "docs: define operational and filesystem contracts"
```

### Task 4: Write setup ownership and lifecycle policies

**Files:**

- Create: `docs/distribution/setup-and-config-ownership.md`
- Create: `docs/distribution/upgrade-removal-and-retention.md`
- Create: `tests/fixtures/distribution/config-examples/codex-before.json`
- Create: `tests/fixtures/distribution/config-examples/codex-after.json`
- Create: `tests/fixtures/distribution/config-examples/claude-code-before.json`
- Create: `tests/fixtures/distribution/config-examples/claude-code-after.json`
- Create: `tests/fixtures/distribution/config-examples/conflicting-relay-entry.json`
- Modify: `tests/unit/contracts/distribution-contract.test.ts`

**Interfaces:**

- Consumes: ownership and lifecycle fixtures from Task 2 plus existing integration documentation.
- Produces: exact merge, backup, conflict, idempotency, upgrade, downgrade, disable, removal, and data-retention contracts with representative fixtures.

- [ ] **Step 1: Add failing assertions for ownership examples and lifecycle statements.**

Test invariants, not client-specific undocumented file locations:

```ts
expect(codexAfter.unrelatedServer).toEqual(codexBefore.unrelatedServer);
expect(codexAfter.relay.command).toBe('relay');
expect(codexAfter.relay.args).toEqual(['mcp']);
expect(conflict.expectedExitCode).toBe(4);
expect(conflict.mutationAllowed).toBe(false);
```

The fixture shape may model only the relevant configuration subtree. Include a `_fixtureNote` explaining that later client adapters must map the abstract entry to the client’s then-current official config format.

- [ ] **Step 2: Run focused tests and confirm failures for missing docs/fixtures.**

Run: `pnpm test -- tests/unit/contracts/distribution-contract.test.ts`

- [ ] **Step 3: Create ownership documentation and examples.**

Use sections:

```md
# Setup and Configuration Ownership

## Ownership Boundary

## Relay Metadata

## Idempotent Setup Algorithm

## Backup and Atomic Write Contract

## Codex Entry Contract

## Claude Code Entry Contract

## Generic MCP Fragment Contract

## Conflict Handling

## Exact Change Reporting

## Secret Redaction
```

Specify the later setup algorithm in this exact order:

1. resolve and validate supported platform
2. resolve Relay paths without creating files
3. load Relay ownership metadata if present
4. locate selected client config
5. parse config without normalization that loses comments/order unless the client format forces it
6. classify desired entry as absent, owned-match, owned-drift, or unowned-conflict
7. compute a change plan
8. return no-change without writes when already correct
9. create backup before mutation
10. write temporary sibling and validate
11. atomically replace original
12. persist ownership metadata only after success
13. print exact redacted change report

- [ ] **Step 4: Create lifecycle documentation.**

Use sections:

```md
# Upgrade, Removal, and Data Retention

## Upgrade

## Database Migration Failure

## Downgrade

## Disable

## Integration Removal

## Package Uninstall

## Explicit Data Deletion

## Backup Retention

## Recovery Guidance
```

Include a lifecycle matrix listing whether package files, client entry, Relay metadata, database, cache, and backups are retained for each action.

- [ ] **Step 5: Re-run focused tests and commit.**

Run: `pnpm test -- tests/unit/contracts/distribution-contract.test.ts`

```bash
git add docs/distribution tests/fixtures/distribution/config-examples tests/unit/contracts/distribution-contract.test.ts
git commit -m "docs: define setup ownership and lifecycle policy"
```

### Task 5: Add compatibility and publication contracts

**Files:**

- Create: `docs/distribution/version-compatibility.md`
- Create: `docs/distribution/release-policy.md`
- Create: `tests/fixtures/distribution/version-compatibility.json`
- Modify: `tests/unit/contracts/distribution-contract.test.ts`

**Interfaces:**

- Consumes: `package.json`, ADR 0002, existing MCP/CLI schema-version conventions, SQL migration infrastructure, and distribution fixtures.
- Produces: one-version compatibility contract and maintainer-controlled release gate for later packaging/release issues.

- [ ] **Step 1: Add failing compatibility and release-policy assertions.**

Validate this fixture shape:

```ts
const compatibilitySchema = z.object({
  applicationVersionSource: z.literal('package.json'),
  versionedAssets: z.array(z.enum(['cli', 'mcp', 'ui', 'migrations', 'skills', 'integrations'])),
  payloadSchemaVersionIndependent: z.literal(true),
  downgradeSupported: z.literal(false),
  releaseTrigger: z.literal('manual-maintainer-action'),
});
```

Also assert the release policy forbids publish on push/merge and requires all supported-platform evidence.

- [ ] **Step 2: Run focused tests and confirm missing files fail.**

Run: `pnpm test -- tests/unit/contracts/distribution-contract.test.ts`

- [ ] **Step 3: Create the compatibility document and fixture.**

Document:

- package version is authoritative application version
- payload schema versions remain explicit and independent
- migrations are forward-only and checked before command service
- packaged skills/integration templates are part of the same release
- setup ownership metadata records writer application version
- unsupported newer migration state fails closed
- no compatibility promise beyond the documented current major

- [ ] **Step 4: Create the release policy.**

Use sections:

```md
# Release Policy

## Maintainer Approval

## Required Automated Gates

## Required Platform Evidence

## Version and Tag Consistency

## Package-Contents Review

## npm Publication Security

## Failure and Rollback Rules

## Out of Scope for Issue #39
```

Do not add a GitHub Actions release workflow. Describe the future workflow contract only.

- [ ] **Step 5: Re-run tests and commit.**

Run: `pnpm test -- tests/unit/contracts/distribution-contract.test.ts`

```bash
git add docs/distribution/version-compatibility.md docs/distribution/release-policy.md tests/fixtures/distribution/version-compatibility.json tests/unit/contracts/distribution-contract.test.ts
git commit -m "docs: define compatibility and release policy"
```

### Task 6: Enforce contract completeness through repository asset validation

**Files:**

- Modify: `scripts/validate-repository-assets.ts`
- Modify: `tests/unit/scripts/validate-repository-assets.test.ts`
- Modify: `tests/unit/contracts/distribution-contract.test.ts` only if shared helpers are extracted

**Interfaces:**

- Consumes: ADR, distribution docs, and fixtures from Tasks 1–5.
- Produces: deterministic CI failure when a required issue #39 asset is missing or a core locked identifier drifts.

- [ ] **Step 1: Add failing asset-validator tests.**

Extend the existing validator test harness with a fixture repository missing one required distribution asset and assert a descriptive failure. Add one passing case containing the complete asset set.

Required paths:

```ts
const requiredDistributionAssets = [
  'docs/decisions/0002-distribution-filesystem-and-lifecycle.md',
  'docs/distribution/operational-cli-contract.md',
  'docs/distribution/filesystem-contract.md',
  'docs/distribution/supported-platforms.md',
  'docs/distribution/setup-and-config-ownership.md',
  'docs/distribution/upgrade-removal-and-retention.md',
  'docs/distribution/version-compatibility.md',
  'docs/distribution/release-policy.md',
  'tests/fixtures/distribution/supported-platforms.json',
  'tests/fixtures/distribution/path-resolution.json',
  'tests/fixtures/distribution/operational-commands.json',
  'tests/fixtures/distribution/client-config-ownership.json',
  'tests/fixtures/distribution/lifecycle-policy.json',
  'tests/fixtures/distribution/version-compatibility.json',
];
```

- [ ] **Step 2: Run the validator tests and confirm they fail before implementation.**

Run: `pnpm test -- tests/unit/scripts/validate-repository-assets.test.ts`

- [ ] **Step 3: Extend the validator narrowly.**

Add presence checks and parse all distribution JSON fixtures. Validate core cross-file identifiers:

- package `@krishna916/relay`
- executable `relay`
- Node major `24`
- exactly three supported platform tuples
- operational commands exactly `setup`, `mcp`, `ui`, `doctor`, `config`
- only `RELAY_DB_PATH` as database environment override
- downgrade unsupported
- normal uninstall retains data
- manual maintainer release trigger

Do not build a generic Markdown parser or duplicate every unit-test assertion in the asset validator.

- [ ] **Step 4: Run focused validation.**

Run: `pnpm test -- tests/unit/scripts/validate-repository-assets.test.ts tests/unit/contracts/distribution-contract.test.ts`

Run: `pnpm validate:assets`

Expected: both test suites and repository validation pass.

- [ ] **Step 5: Commit validator enforcement.**

```bash
git add scripts/validate-repository-assets.ts tests/unit/scripts/validate-repository-assets.test.ts
git commit -m "test: validate distribution contract assets"
```

### Task 7: Link the contract from project guidance and complete verification

**Files:**

- Modify: `README.md`
- Modify: `docs/source-checkout-guide.md` only to distinguish source-checkout instructions from future npm distribution
- Modify: `AGENTS.md` only if it maintains the authoritative-document index
- Create: `docs/manual-verification/distribution-contract-review.md`

**Interfaces:**

- Consumes: all issue #39 deliverables.
- Produces: discoverable contract links and a human review checklist; no new installation instructions pretending publication already exists.

- [ ] **Step 1: Add minimal discoverability links.**

In README documentation links, add:

```md
- [Distribution decision](docs/decisions/0002-distribution-filesystem-and-lifecycle.md)
- [Distribution contracts](docs/distribution/)
```

In the source-checkout guide, add a note that source-checkout commands remain current and npm installation is not available until the later packaging/publication issues are completed.

- [ ] **Step 2: Create the human review checklist.**

`docs/manual-verification/distribution-contract-review.md` must ask the reviewer to confirm:

- package and executable identity
- only three supported platform claims
- exact paths and precedence
- no `cwd` dependency
- config preservation, ownership conflict, backup, and idempotency rules
- retention across disable/removal/uninstall
- unsupported downgrade behavior
- one application version across assets
- manual release approval
- no production packaging/setup/doctor code introduced

- [ ] **Step 3: Run targeted and full verification.**

```bash
pnpm format:check
pnpm lint
pnpm typecheck
pnpm test -- tests/unit/contracts/distribution-contract.test.ts tests/unit/scripts/validate-repository-assets.test.ts
pnpm validate:assets
pnpm verify
```

Expected: all commands pass with no warnings, no tracked-file rewrites, and no weakened thresholds.

- [ ] **Step 4: Inspect scope and repository diff.**

Run:

```bash
git status --short
git diff --stat HEAD~7..HEAD
git diff HEAD~7..HEAD -- package.json src
```

Expected:

- documentation, fixtures, tests, and narrow asset-validator changes only
- no production operational command implementation
- no package publication workflow
- no user configuration mutation code
- no changes to task command behavior

- [ ] **Step 5: Commit final discoverability and review evidence.**

```bash
git add README.md docs/source-checkout-guide.md AGENTS.md docs/manual-verification/distribution-contract-review.md
git commit -m "docs: link Relay distribution contracts"
```

Omit unchanged optional files from `git add`.

## Human Review Gates

1. **Decision review:** Verify `@krishna916/relay`, `relay`, Node 24, and the three-platform matrix before approving any later packaging issue.
2. **Path review:** Compare every OS path and precedence rule across ADR, docs, and fixtures; reject casing or root-directory drift.
3. **Ownership review:** Confirm a conflicting unowned `relay` entry is never overwritten and every real mutation requires a backup.
4. **Lifecycle review:** Confirm disable, removal, and package uninstall retain the database and backups; destructive deletion is separate.
5. **Scope review:** Reject production `setup`, `doctor`, publication, or real config-editing code in this issue.
6. **Verification review:** Run `pnpm verify` independently and inspect asset-validation failures by temporarily removing one fixture in an uncommitted working tree.

## Plan Self-Review

- **Spec coverage:** Tasks 1–5 cover all thirteen issue decisions and all deliverables; Task 6 enforces drift detection; Task 7 covers discoverability, manual review, and the full acceptance gate.
- **No placeholders:** Package identity, supported matrix, Node major, exact paths, precedence, exit codes, command responsibilities, ownership algorithm, lifecycle behavior, versioning, release trigger, files, tests, and commands are explicit.
- **Type consistency:** Fixture names and values are stable across tasks: package `@krishna916/relay`, executable `relay`, Node `24`, entry name `relay`, database override `RELAY_DB_PATH`, and exit codes `0`–`5`.
- **Scope control:** The plan deliberately documents the future public contract without changing package publication, operational command dispatch, database path resolution, or real client configuration.
