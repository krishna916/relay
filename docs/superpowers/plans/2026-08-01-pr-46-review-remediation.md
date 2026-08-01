# PR #46 Distribution Contract Review Remediation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Correct PR #46’s ADR identity, platform path wording, and client configuration ownership contracts without introducing production setup, packaging, or configuration mutation code.

**Architecture:** Keep the distribution ADR authoritative, but renumber it so it does not collide with the accepted agent-integration ADR. Replace abstract client configuration examples with native Codex TOML and Claude Code JSON fixtures, and lock an explicit-path-only mutation policy so future setup code does not guess vendor configuration locations. Extend existing contract and asset-validation tests to reject drift.

**Tech Stack:** Markdown ADRs and operational contracts, TOML and JSON fixtures, TypeScript, `@iarna/toml`, Zod, Vitest, Node.js 24, pnpm.

## Global Constraints

- Remain contract-only. Do not implement `relay setup`, `relay doctor`, package publication, filesystem writes, or real client configuration editing.
- Preserve package name `@krishna916/relay`, executable `relay`, Node `>=24 <25`, and the supported platform matrix already approved in issue #39.
- Preserve the operational command surface and exit codes `0` through `5`.
- Preserve normal uninstall/data-retention and unsupported-downgrade policies.
- Preserve all existing source-checkout integration assets and behavior.
- Codex and Claude Code config mutation requires an explicitly supplied absolute config file path. Do not auto-discover or guess vendor config locations in the MVP.
- Generic MCP clients remain fragment-only and are never mutated by default.
- Installed entries use `command = relay` / `"command": "relay"` and arguments `mcp`; source-checkout templates continue using `node <checkout>/dist/mcp/main.js`.
- Do not add environment variables other than the already-approved `RELAY_DB_PATH` database override.
- `pnpm verify` must pass without weakening lint, coverage, audit, or asset-validation gates.

---

## Locked Remediation Decisions

### ADR identity

- Existing accepted agent integration ADR remains `docs/decisions/0002-agent-integration-contracts.md`.
- Rename the distribution ADR to `docs/decisions/0003-distribution-filesystem-and-lifecycle.md`.
- Every link, path constant, validator, test, checklist, and plan reference must use `0003`.
- Do not renumber or alter the existing agent-integration ADR.

### Platform directory casing

Use these names exactly:

| Platform | Relay-owned directory casing                                                                                  |
| -------- | ------------------------------------------------------------------------------------------------------------- |
| Windows  | `Relay` and `Cache`, matching `%LOCALAPPDATA%\\Relay`, `%APPDATA%\\Relay`, and `%LOCALAPPDATA%\\Relay\\Cache` |
| macOS    | `Relay`, matching `~/Library/Application Support/Relay` and `~/Library/Caches/Relay`                          |
| Linux    | lowercase `relay`, matching XDG conventions                                                                   |

Replace the contradictory sentence about all directory names being lowercase. The contract must say casing is platform-specific and path comparisons follow native platform semantics; Relay itself emits the canonical spellings above.

### Client configuration target selection

For future mutating setup operations:

- The caller must provide an explicit absolute client config file path.
- Relay must reject an omitted path for mutating Codex/Claude Code setup with exit code `2`.
- Relay must reject a relative path with exit code `2`.
- Relay must not search home directories, repository ancestors, environment variables, or vendor defaults to find a config file.
- Relay metadata stores the normalized absolute path that was explicitly supplied.
- Documentation may show common examples, but examples are not discovery rules.
- Read-only fragment generation may work without a path.

This policy is deliberate: vendor config locations and scopes can change independently of Relay. Explicit paths keep mutation ownership testable and prevent editing the wrong user or project configuration.

### Codex native ownership contract

Target format: TOML.

Relay owns exactly these two values under the exact table `mcp_servers.relay`:

```toml
[mcp_servers.relay]
command = "relay"
args = ["mcp"]
```

Rules:

- Preserve all unrelated TOML keys and tables.
- An absent `mcp_servers.relay` table is `absent` and may be created after backup.
- An exact table with `command = "relay"` and `args = ["mcp"]` is `owned-match` only when Relay metadata records the same absolute file path and owned identifier `mcp_servers.relay`; otherwise it is an unowned conflict.
- A metadata-owned table with different command/args is `owned-drift` and may be restored after backup.
- Any unowned existing `mcp_servers.relay` table is `unowned-conflict`, exit code `4`, no mutation.
- Do not infer ownership from `command = "relay"` alone.
- No `env` table is added by default. A user-managed `RELAY_DB_PATH` entry is preserved but is not owned or rewritten by Relay unless a future contract explicitly adds environment ownership.

### Claude Code native ownership contract

Target format: JSON.

Relay owns exactly `mcpServers.relay.command` and `mcpServers.relay.args`:

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

Rules:

- Preserve every unrelated root property, every unrelated `mcpServers` entry, and unrelated properties inside the `relay` object.
- An absent `mcpServers.relay` property is `absent` and may be created after backup.
- An exact object with `command: "relay"` and `args: ["mcp"]` is `owned-match` only when Relay metadata records the same absolute file path and owned identifier `mcpServers.relay`; otherwise it is an unowned conflict.
- A metadata-owned object with different command/args is `owned-drift` and may be restored after backup.
- Any unowned existing `mcpServers.relay` object is `unowned-conflict`, exit code `4`, no mutation.
- Do not infer ownership from the command string alone.
- Existing `env` and other keys are preserved but are not Relay-owned in the MVP.

### Fixture layout

Replace the abstract cross-client JSON examples with native fixtures:

```text
tests/fixtures/distribution/config-examples/
  codex-before.toml
  codex-after.toml
  codex-conflict.toml
  claude-code-before.json
  claude-code-after.json
  claude-code-conflict.json
```

The fixtures must include unrelated content proving preservation. Conflict fixtures must include an existing Relay entry using a different command and must be paired with assertions for exit code `4` and no mutation in the ownership-policy fixture/test; do not encode test-only fields into real client config syntax.

---

### Task 1: Renumber the distribution ADR and remove every stale `0002` reference

**Files:**

- Rename: the legacy distribution ADR → `docs/decisions/0003-distribution-filesystem-and-lifecycle.md`
- Modify: `README.md`
- Modify: every file under `docs/distribution/`
- Modify: `docs/manual-verification/distribution-contract-review.md`
- Modify: `docs/superpowers/plans/2026-08-01-issue-39-distribution-contracts.md`
- Modify: `scripts/validate-repository-assets.ts`
- Modify: `tests/unit/contracts/distribution-contract.test.ts`
- Modify: `tests/unit/scripts/validate-repository-assets.test.ts`

**Interfaces:**

- Consumes: the existing accepted `docs/decisions/0002-agent-integration-contracts.md`.
- Produces: one unique distribution ADR path, `docs/decisions/0003-distribution-filesystem-and-lifecycle.md`, referenced consistently everywhere.

- [ ] **Step 1: Add a failing uniqueness assertion before renaming.**

In `tests/unit/contracts/distribution-contract.test.ts`, derive the distribution ADR path as `0003` and add assertions that both accepted ADRs exist independently:

```ts
const distributionAdrPath = resolve('docs/decisions/0003-distribution-filesystem-and-lifecycle.md');
const agentIntegrationAdrPath = resolve('docs/decisions/0002-agent-integration-contracts.md');

expect(readFileSync(agentIntegrationAdrPath, 'utf8')).toContain('Agent Integration');
expect(readFileSync(distributionAdrPath, 'utf8')).toContain(
  'Relay Distribution, Filesystem, and Lifecycle Contract',
);
```

- [ ] **Step 2: Run the focused test and verify it fails with `ENOENT` for ADR `0003`.**

Run:

```bash
pnpm test -- tests/unit/contracts/distribution-contract.test.ts
```

- [ ] **Step 3: Rename the ADR and replace all exact stale path references.**

Use `git mv` for the ADR. Search live repository assets from the repository root:

```bash
git mv <legacy-distribution-adr> docs/decisions/0003-distribution-filesystem-and-lifecycle.md
rg -n '0002-[Dd]istribution-filesystem-and-lifecycle' README.md docs scripts tests
```

Replace every reported distribution reference with `0003-distribution-filesystem-and-lifecycle`. Do not replace `0002-agent-integration-contracts`.

- [ ] **Step 4: Add an asset-validation regression assertion.**

Update validator tests so a fixture repository containing the distribution ADR under `0002` but not `0003` fails with a message naming the required `0003` path.

- [ ] **Step 5: Run focused contract and validator tests.**

```bash
pnpm test -- tests/unit/contracts/distribution-contract.test.ts tests/unit/scripts/validate-repository-assets.test.ts
```

Expected: PASS.

- [ ] **Step 6: Verify no stale distribution ADR references remain and commit.**

```bash
rg -n '0002-[Dd]istribution-filesystem-and-lifecycle' README.md docs scripts tests
git status --short
git add README.md docs scripts/validate-repository-assets.ts tests/unit
 git commit -m "docs: renumber distribution ADR"
```

Expected `rg`: no matches.

### Task 2: Make platform path casing explicit and internally consistent

**Files:**

- Modify: `docs/decisions/0003-distribution-filesystem-and-lifecycle.md`
- Modify: `docs/distribution/filesystem-contract.md`
- Modify: `tests/unit/contracts/distribution-contract.test.ts`
- Modify: `tests/fixtures/distribution/path-resolution.json` only if it currently describes casing generically.

**Interfaces:**

- Consumes: approved exact platform paths.
- Produces: an unambiguous platform-specific casing rule aligned with every path table and fixture.

- [ ] **Step 1: Add failing wording and canonical-path assertions.**

Add assertions:

```ts
expect(adr).toContain('Directory casing is platform-specific');
expect(adr).toContain('Windows and macOS use `Relay`; Linux uses lowercase `relay`');
expect(adr).not.toContain('the obsolete lowercase-directory casing sentence');

expect(filesystem).toContain('%LOCALAPPDATA%\\Relay\\relay.db');
expect(filesystem).toContain('~/Library/Application Support/Relay/relay.db');
expect(filesystem).toContain('${XDG_DATA_HOME:-~/.local/share}/relay/relay.db');
```

- [ ] **Step 2: Run the focused test and confirm the new wording assertion fails.**

```bash
pnpm test -- tests/unit/contracts/distribution-contract.test.ts
```

- [ ] **Step 3: Replace the contradictory casing statement in both authoritative and derived docs.**

Use this exact rule:

```md
Directory casing is platform-specific. Relay emits `Relay` for Windows and
macOS application directories and lowercase `relay` for Linux XDG directories.
Windows cache uses the canonical child name `Cache`. Path comparison follows
native platform semantics, but generated paths always use these spellings.
```

Do not change the approved path table values.

- [ ] **Step 4: Run the focused tests and commit.**

```bash
pnpm test -- tests/unit/contracts/distribution-contract.test.ts
git add docs/decisions/0003-distribution-filesystem-and-lifecycle.md \
  docs/distribution/filesystem-contract.md \
  tests/unit/contracts/distribution-contract.test.ts \
  tests/fixtures/distribution/path-resolution.json
git commit -m "docs: clarify platform path casing"
```

### Task 3: Replace abstract client examples with native Codex and Claude Code fixtures

**Files:**

- Delete: the legacy abstract Codex JSON fixtures
- Delete: `tests/fixtures/distribution/config-examples/claude-code-before.json`
- Delete: `tests/fixtures/distribution/config-examples/claude-code-after.json`
- Delete: the legacy abstract conflict fixture
- Create: `tests/fixtures/distribution/config-examples/codex-before.toml`
- Create: `tests/fixtures/distribution/config-examples/codex-after.toml`
- Create: `tests/fixtures/distribution/config-examples/codex-conflict.toml`
- Create: `tests/fixtures/distribution/config-examples/claude-code-before.json`
- Create: `tests/fixtures/distribution/config-examples/claude-code-after.json`
- Create: `tests/fixtures/distribution/config-examples/claude-code-conflict.json`
- Modify: `tests/unit/contracts/distribution-contract.test.ts`
- Modify: `tests/fixtures/distribution/client-config-ownership.json`

**Interfaces:**

- Consumes: `@iarna/toml` already present in dev dependencies; installed command contract `relay mcp`.
- Produces: native-format fixtures that later adapters can reuse directly.

- [ ] **Step 1: Rewrite the ownership test to load TOML and JSON native fixtures.**

Import TOML parsing:

```ts
import { parse as parseToml } from '@iarna/toml';

function readTomlConfigExample(name: string): Record<string, unknown> {
  return parseToml(readFileSync(resolve(configExampleRoot, name), 'utf8')) as Record<
    string,
    unknown
  >;
}
```

Assert exact native paths:

```ts
const codexAfter = readTomlConfigExample('codex-after.toml');
expect(codexAfter).toMatchObject({
  mcp_servers: { relay: { command: 'relay', args: ['mcp'] } },
});

const claudeAfter = readConfigExample('claude-code-after.json');
expect(claudeAfter).toMatchObject({
  mcpServers: { relay: { command: 'relay', args: ['mcp'] } },
});
```

Also assert unrelated root keys, unrelated MCP servers, and unrelated nested keys are byte-semantically preserved after parsing.

- [ ] **Step 2: Run the focused test and confirm it fails because native fixtures do not exist.**

```bash
pnpm test -- tests/unit/contracts/distribution-contract.test.ts
```

- [ ] **Step 3: Create the Codex TOML fixtures.**

`codex-before.toml`:

```toml
model = "example-model"

[mcp_servers.unrelated]
command = "unrelated-command"
args = ["serve"]
```

`codex-after.toml`:

```toml
model = "example-model"

[mcp_servers.unrelated]
command = "unrelated-command"
args = ["serve"]

[mcp_servers.relay]
command = "relay"
args = ["mcp"]
```

`codex-conflict.toml`:

```toml
model = "example-model"

[mcp_servers.relay]
command = "other-relay-wrapper"
args = ["serve"]
```

- [ ] **Step 4: Create the Claude Code JSON fixtures.**

`claude-code-before.json`:

```json
{
  "projectSetting": "preserve-me",
  "mcpServers": {
    "unrelated": {
      "command": "unrelated-command",
      "args": ["serve"]
    }
  }
}
```

`claude-code-after.json`:

```json
{
  "projectSetting": "preserve-me",
  "mcpServers": {
    "unrelated": {
      "command": "unrelated-command",
      "args": ["serve"]
    },
    "relay": {
      "command": "relay",
      "args": ["mcp"]
    }
  }
}
```

`claude-code-conflict.json`:

```json
{
  "projectSetting": "preserve-me",
  "mcpServers": {
    "relay": {
      "command": "other-relay-wrapper",
      "args": ["serve"]
    }
  }
}
```

- [ ] **Step 5: Move expected conflict behavior into `client-config-ownership.json`.**

Add exact fields:

```json
{
  "codexOwnedIdentifier": "mcp_servers.relay",
  "claudeCodeOwnedIdentifier": "mcpServers.relay",
  "installedCommand": "relay",
  "installedArgs": ["mcp"],
  "configPathSelection": "explicit-absolute-path-only",
  "missingOrRelativePathExitCode": 2,
  "conflictExitCode": 4,
  "mutateGenericByDefault": false,
  "preserveUnrelatedConfiguration": true,
  "inferOwnershipFromCommandName": false
}
```

Retain the existing backup pattern and ownership metadata fields. Update its Zod schema and exact assertions accordingly.

- [ ] **Step 6: Run focused tests and commit.**

```bash
pnpm test -- tests/unit/contracts/distribution-contract.test.ts
git add tests/fixtures/distribution tests/unit/contracts/distribution-contract.test.ts
git commit -m "test: add native client ownership fixtures"
```

### Task 4: Lock explicit config-path selection and native merge semantics in documentation

**Files:**

- Modify: `docs/decisions/0003-distribution-filesystem-and-lifecycle.md`
- Modify: `docs/distribution/setup-and-config-ownership.md`
- Modify: `docs/distribution/operational-cli-contract.md`
- Modify: `docs/manual-verification/distribution-contract-review.md`
- Modify: `tests/unit/contracts/distribution-contract.test.ts`

**Interfaces:**

- Consumes: Task 3 native fixtures and ownership fixture fields.
- Produces: an implementation-ready ownership and target-selection contract for future setup work.

- [ ] **Step 1: Add failing documentation assertions for every locked decision.**

Assert all of the following strings are present in the ADR or ownership document:

```ts
for (const required of [
  'explicit absolute client configuration path',
  'does not auto-discover client configuration files',
  '`mcp_servers.relay`',
  '`mcpServers.relay`',
  '`command = "relay"`',
  '`"command": "relay"`',
  '`args = ["mcp"]`',
  '`"args": ["mcp"]`',
  'existing `env` values are preserved but are not Relay-owned',
]) {
  expect(`${adr}\n${ownership}\n${operational}`).toContain(required);
}
```

Also assert the obsolete wording is absent:

```ts
expect(ownership).not.toContain('the obsolete abstract-client wording');
```

- [ ] **Step 2: Run the focused test and verify the new assertions fail.**

```bash
pnpm test -- tests/unit/contracts/distribution-contract.test.ts
```

- [ ] **Step 3: Add target-selection rules to the ADR and operational contract.**

Document:

```md
Future mutating Codex or Claude Code setup requires an explicitly supplied
absolute client configuration file path. Omitted or relative paths are usage
errors with exit code `2`. Relay does not auto-discover vendor configuration
files, traverse parent directories, or infer scope. The normalized absolute
path is recorded in Relay ownership metadata. Fragment generation remains
available without mutation.
```

Do not invent the future CLI flag name in this issue. The later setup-command issue may choose syntax, but it must preserve this required input and behavior.

- [ ] **Step 4: Replace abstract Codex/Claude sections with exact native merge contracts.**

Copy the **Codex native ownership contract** and **Claude Code native ownership contract** from this plan into `setup-and-config-ownership.md`. Link each section to its corresponding fixture paths. Explicitly distinguish installed-package entries from existing source-checkout templates.

- [ ] **Step 5: Expand the manual review checklist.**

Add checks that a reviewer confirms:

- distribution ADR is uniquely numbered `0003`;
- platform casing wording matches all path tables;
- mutating setup requires an explicit absolute config path;
- no automatic client-config discovery is promised;
- Codex TOML and Claude Code JSON fixtures use their native entry shapes;
- unrelated configuration and unowned conflicts are preserved/refused;
- source-checkout templates remain unchanged.

- [ ] **Step 6: Run focused tests and commit.**

```bash
pnpm test -- tests/unit/contracts/distribution-contract.test.ts
git add docs/decisions/0003-distribution-filesystem-and-lifecycle.md \
  docs/distribution docs/manual-verification/distribution-contract-review.md \
  tests/unit/contracts/distribution-contract.test.ts
git commit -m "docs: lock native client config ownership"
```

### Task 5: Strengthen repository asset validation and complete verification

**Files:**

- Modify: `scripts/validate-repository-assets.ts`
- Modify: `tests/unit/scripts/validate-repository-assets.test.ts`
- Modify: PR description if validation totals or scope summary changed.

**Interfaces:**

- Consumes: corrected ADR path and native ownership fixtures.
- Produces: CI failures for ADR-number regression, abstract-fixture regression, unsupported auto-discovery claims, or installed-entry drift.

- [ ] **Step 1: Add failing validator tests.**

Cover these mutations independently:

1. Rename/remove ADR `0003` → validation fails.
2. Change Codex installed command from `relay` to `node` → validation fails.
3. Change Claude Code installed args from `["mcp"]` → validation fails.
4. Set `configPathSelection` to anything except `explicit-absolute-path-only` → validation fails.
5. Set missing/relative path exit code to anything except `2` → validation fails.
6. Restore any legacy abstract Codex JSON fixture expectation → validation fails because native TOML assets are required.

- [ ] **Step 2: Run validator tests and confirm the new cases fail.**

```bash
pnpm test -- tests/unit/scripts/validate-repository-assets.test.ts
```

- [ ] **Step 3: Update required assets and drift checks.**

`requiredDistributionAssets` must include:

```ts
'docs/decisions/0003-distribution-filesystem-and-lifecycle.md',
'tests/fixtures/distribution/config-examples/codex-before.toml',
'tests/fixtures/distribution/config-examples/codex-after.toml',
'tests/fixtures/distribution/config-examples/codex-conflict.toml',
'tests/fixtures/distribution/config-examples/claude-code-before.json',
'tests/fixtures/distribution/config-examples/claude-code-after.json',
'tests/fixtures/distribution/config-examples/claude-code-conflict.json',
```

Parse Codex fixtures with `@iarna/toml`; parse Claude fixtures with JSON. Validate exact installed entry shapes and ownership-policy fields. Do not make the validator perform or simulate file mutation.

- [ ] **Step 4: Run focused tests, then all quality gates.**

```bash
pnpm test -- tests/unit/contracts/distribution-contract.test.ts \
  tests/unit/scripts/validate-repository-assets.test.ts
pnpm validate:assets
pnpm verify
```

Expected: all pass; no decrease to configured coverage thresholds.

- [ ] **Step 5: Perform repository-wide drift searches.**

```bash
rg -n '0002-[Dd]istribution-filesystem-and-lifecycle' README.md docs scripts tests
rg -n 'maps this [Aa]bstract subtree|then-current [Oo]fficial' docs tests
rg -n 'codex-(before|after)[.]json|conflicting-relay-entry[.]json' README.md docs scripts tests
rg -n 'Directory names are lowercase [.]relay, except' docs
```

Expected: no matches.

Confirm source-checkout templates are unchanged:

```bash
git diff origin/main...HEAD -- integrations/codex/config.toml.example \
  integrations/claude-code/.mcp.json.example
```

Expected: no changes from this remediation.

- [ ] **Step 6: Update the PR summary and commit final validation changes.**

The PR description must state:

- distribution ADR is `0003`;
- client config mutation requires an explicit absolute path;
- Codex TOML and Claude Code JSON native contracts are included;
- no production setup/config mutation was added;
- final `pnpm verify` result.

```bash
git add scripts/validate-repository-assets.ts \
  tests/unit/scripts/validate-repository-assets.test.ts
git commit -m "test: validate corrected distribution contracts"
```

## Human Review Checkpoints

1. Confirm `0002-agent-integration-contracts.md` remains unchanged and the distribution ADR is uniquely `0003`.
2. Review the explicit-path-only policy; ensure it prevents accidental mutation without making read-only fragment generation impossible.
3. Compare native fixtures against `integrations/codex/config.toml.example` and `integrations/claude-code/.mcp.json.example`; only the execution command differs because one is installed-package and the other is source-checkout.
4. Confirm ownership requires both metadata and exact path/identifier; command-name resemblance alone never proves ownership.
5. Confirm no production setup, filesystem mutation, or publication code entered the PR.
6. Independently run `pnpm verify` before approving.

## Plan Self-Review

- **Review finding coverage:** Task 1 resolves the ADR collision; Task 2 resolves path-casing contradiction; Tasks 3–5 replace abstract fixtures and lock exact native ownership, target selection, validation, and documentation.
- **Scope:** All changes remain documentation, fixtures, and validation only.
- **No placeholders:** Exact paths, fixture contents, assertions, commands, expected failures, commits, and ownership decisions are specified.
- **Consistency:** Installed entries uniformly use `relay mcp`; existing source-checkout templates remain `node <checkout>/dist/mcp/main.js` and are explicitly preserved.
