# PR #49 Dependency Audit Remediation Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Restore a green `pnpm verify` gate by upgrading dependency parents and applying narrowly scoped patched-version overrides, using advisory suppression only when no safe patched dependency resolution is available.

**Architecture:** Keep the existing `pnpm audit --audit-level high` CI gate. Resolve advisories in layers: first upgrade direct dependencies, then force only vulnerable transitive ranges to patched versions through `pnpm.overrides`, and only then use `pnpm.auditConfig.ignoreGhsas` for an advisory that cannot be safely resolved. Every dependency graph change must be locked in `pnpm-lock.yaml` and verified through the complete test, package, MCP, UI, and audit gates.

**Tech Stack:** Node.js 24, pnpm 10.2.0, `package.json` pnpm configuration, `pnpm-lock.yaml`, GitHub Actions CI.

## Global Constraints

- Do not remove or weaken `pnpm audit --audit-level high` from `audit` or `verify`.
- Do not use `--no-audit`, `|| true`, `continue-on-error`, a lower audit severity, or a blanket audit exclusion.
- Prefer a direct parent dependency upgrade over a transitive override.
- Prefer a patched-version override over advisory suppression.
- Suppress only a specific GHSA ID, never a package name, severity, or all advisories.
- Do not suppress an advisory when a patched version can be installed and passes Relay verification.
- Keep existing dependency version ranges unchanged unless this plan explicitly changes them.
- Do not upgrade unrelated dependencies.
- Do not accept a prerelease, alpha, beta, RC, Git dependency, or tarball URL.
- Preserve Node `>=24 <25`, pnpm `10.2.0`, MCP tool contracts, CLI behavior, package contents, and doctor schema.
- `package.json` and `pnpm-lock.yaml` must be committed together for every dependency graph change.
- Use `pnpm install --frozen-lockfile` after lockfile generation to prove reproducibility.
- The final GitHub Actions run for the updated PR head must be green before marking the PR ready.

## Current CI Evidence

GitHub Actions run `31019463627` passes formatting, lint, typecheck, all 701 tests, coverage, build, package metadata, and asset validation. It fails only at `pnpm audit --audit-level high` for these high-severity advisories:

| Package           | Vulnerable resolved version | Patched floor | Advisory              | Current path                                                               |
| ----------------- | --------------------------: | ------------: | --------------------- | -------------------------------------------------------------------------- |
| `fast-uri`        |                     `3.1.4` |       `3.1.5` | `GHSA-7p8r-x3mc-p8w7` | `@modelcontextprotocol/sdk@1.29.0 > ajv@8.20.0 > fast-uri`                 |
| `ip-address`      |                    `10.2.2` |      `10.3.1` | `GHSA-mwp4-54f8-5fhr` | `@modelcontextprotocol/sdk@1.29.0 > express-rate-limit@8.6.0 > ip-address` |
| `brace-expansion` |                     `5.0.8` |       `5.0.9` | `GHSA-rgw5-rvv9-x895` | ESLint / typescript-eslint / minimatch dependency paths                    |

The stable `@modelcontextprotocol/sdk` release available during planning is `1.30.0`. The repository currently declares `^1.29.0`. The currently declared `@typescript-eslint/*` version is already `^8.65.0`, so do not invent an unavailable stable parent upgrade for the `brace-expansion` advisory.

---

### Task 1: Capture the dependency graph and audit baseline

**Files:**

- No source changes.
- Inspect: `package.json`
- Inspect: `pnpm-lock.yaml`

**Interfaces:**

- Consumes: current PR branch and registry metadata.
- Produces: exact before-state evidence used to choose upgrades and overrides.

- [ ] **Step 1: Ensure the branch is current and clean.**

Run:

```bash
git status --short
git rev-parse HEAD
```

Expected:

- no uncommitted files;
- HEAD is the latest PR branch commit.

- [ ] **Step 2: Install exactly the committed dependency graph.**

Run:

```bash
corepack enable
pnpm install --frozen-lockfile
```

Expected: PASS without modifying `pnpm-lock.yaml`.

- [ ] **Step 3: Save the machine-readable audit baseline outside committed source.**

Run:

```bash
mkdir -p .artifacts/audit
pnpm audit --json > .artifacts/audit/before.json || true
```

Expected: command writes JSON and exits non-zero because the three high advisories are present.

- [ ] **Step 4: Confirm every vulnerable dependency path.**

Run:

```bash
pnpm why fast-uri
pnpm why ip-address
pnpm why brace-expansion
```

Expected:

- `fast-uri@3.1.4` is reachable through MCP SDK / AJV paths;
- `ip-address@10.2.2` is reachable through MCP SDK / express-rate-limit;
- `brace-expansion@5.0.8` is reachable through ESLint/typescript-eslint/minimatch paths.

- [ ] **Step 5: Do not commit baseline artifacts.**

Run:

```bash
git status --short
```

Expected: `.artifacts/` is ignored or remains untracked and is not staged.

---

### Task 2: Upgrade the direct MCP SDK dependency

**Files:**

- Modify: `package.json`
- Modify: `pnpm-lock.yaml`

**Interfaces:**

- Consumes: existing MCP imports and tests.
- Produces: a stable direct dependency on `@modelcontextprotocol/sdk@^1.30.0` and a regenerated lockfile.

- [ ] **Step 1: Upgrade only the direct MCP SDK dependency.**

Run:

```bash
pnpm up @modelcontextprotocol/sdk@^1.30.0
```

Expected:

- `package.json` changes `@modelcontextprotocol/sdk` from `^1.29.0` to `^1.30.0`;
- `pnpm-lock.yaml` is regenerated;
- no unrelated direct dependency range changes.

- [ ] **Step 2: Inspect the direct dependency diff.**

Run:

```bash
git diff -- package.json pnpm-lock.yaml
```

Reject the change if it upgrades unrelated direct dependencies or introduces a prerelease.

- [ ] **Step 3: Run MCP-focused verification before the full suite.**

Run:

```bash
pnpm build:node
pnpm vitest run \
  tests/unit/interfaces/mcp/create-mcp-server.test.ts \
  tests/unit/interfaces/mcp/mcp-tool-contracts.test.ts \
  tests/unit/interfaces/mcp/run-mcp-server.test.ts \
  tests/integration/mcp-stdio.test.ts \
  tests/integration/mcp-cli-parity.test.ts
```

Expected: PASS with unchanged MCP tool names and contracts.

- [ ] **Step 4: Re-run the audit and inspect remaining advisories.**

Run:

```bash
pnpm audit --json > .artifacts/audit/after-sdk-upgrade.json || true
pnpm audit --audit-level high
```

Interpretation:

- If all high advisories disappear, skip Tasks 3 and 4 and continue to Task 6.
- If one or more remain, continue with the exact package-specific override tasks below.

- [ ] **Step 5: Commit the direct upgrade independently.**

```bash
git add package.json pnpm-lock.yaml
git commit -m "chore: upgrade MCP SDK for security fixes"
```

---

### Task 3: Override remaining MCP transitive vulnerabilities to patched versions

**Files:**

- Modify: `package.json`
- Modify: `pnpm-lock.yaml`

**Interfaces:**

- Consumes: audit result after the SDK upgrade.
- Produces: version-scoped overrides only for MCP transitive packages still resolved below patched floors.

- [ ] **Step 1: Add only the overrides still required after Task 2.**

In the existing `pnpm.overrides` object, preserve `tmp: 0.2.7` and add the relevant selectors:

```json
{
  "pnpm": {
    "overrides": {
      "tmp": "0.2.7",
      "fast-uri@>=3.0.0 <3.1.5": "3.1.5",
      "ip-address@<=10.3.0": "10.3.1"
    }
  }
}
```

Rules:

- Omit `fast-uri` if the SDK upgrade already resolves every installed `fast-uri` to `>=3.1.5`.
- Omit `ip-address` if the SDK upgrade already resolves every installed `ip-address` to `>=10.3.1`.
- Do not add an override merely because it appears in this plan; add it only when `pnpm audit` and `pnpm why` prove it is still required.

- [ ] **Step 2: Regenerate the lockfile.**

Run:

```bash
pnpm install
```

Expected: lockfile resolves the overridden vulnerable range to the exact patched version.

- [ ] **Step 3: Prove the resolved versions.**

Run:

```bash
pnpm why fast-uri
pnpm why ip-address
pnpm list fast-uri ip-address --depth Infinity
```

Expected:

- no installed `fast-uri` in `>=3.0.0 <3.1.5`;
- no installed `ip-address <=10.3.0`.

- [ ] **Step 4: Run MCP and HTTP focused tests because these packages sit under the MCP SDK server stack.**

Run:

```bash
pnpm build:node
pnpm vitest run \
  tests/unit/interfaces/mcp/create-mcp-server.test.ts \
  tests/unit/interfaces/mcp/mcp-tool-contracts.test.ts \
  tests/unit/interfaces/mcp/run-mcp-server.test.ts \
  tests/integration/mcp-stdio.test.ts \
  tests/integration/mcp-cli-parity.test.ts \
  tests/integration/http-health.test.ts \
  tests/integration/http-tasks.test.ts
```

Expected: PASS.

- [ ] **Step 5: Re-run audit.**

Run:

```bash
pnpm audit --audit-level high
```

Expected: neither `GHSA-7p8r-x3mc-p8w7` nor `GHSA-mwp4-54f8-5fhr` remains.

- [ ] **Step 6: Commit the transitive MCP remediation.**

```bash
git add package.json pnpm-lock.yaml
git commit -m "chore: pin patched MCP transitive dependencies"
```

If no MCP override was required, do not create an empty commit.

---

### Task 4: Override the vulnerable brace-expansion v5 range

**Files:**

- Modify: `package.json`
- Modify: `pnpm-lock.yaml`

**Interfaces:**

- Consumes: current ESLint/typescript-eslint dependency graph.
- Produces: `brace-expansion@5.0.9` only for the vulnerable v4/v5 selector range, without forcing legacy major-version consumers to v5.

- [ ] **Step 1: Add a version-scoped override.**

Add this entry to the existing `pnpm.overrides` object:

```json
"brace-expansion@>=4.0.0 <5.0.9": "5.0.9"
```

Do not use this unsafe broad override:

```json
"brace-expansion": "5.0.9"
```

The broad form could force older consumers expecting v1 or v2 APIs onto v5.

- [ ] **Step 2: Regenerate the lockfile.**

Run:

```bash
pnpm install
```

- [ ] **Step 3: Prove the vulnerable v5 resolution is gone.**

Run:

```bash
pnpm why brace-expansion
pnpm list brace-expansion --depth Infinity
```

Expected: no installed `brace-expansion@5.0.8`; vulnerable v4/v5 selector paths resolve to `5.0.9`.

- [ ] **Step 4: Verify the lint/tooling stack.**

Run:

```bash
pnpm format:check
pnpm lint
pnpm typecheck
```

Expected: PASS.

- [ ] **Step 5: Re-run audit.**

Run:

```bash
pnpm audit --audit-level high
```

Expected: `GHSA-rgw5-rvv9-x895` is absent.

- [ ] **Step 6: Commit the tooling override.**

```bash
git add package.json pnpm-lock.yaml
git commit -m "chore: pin patched brace expansion dependency"
```

---

### Task 5: Use advisory suppression only for an unresolved incompatible case

**Files:**

- Modify only if required: `package.json`
- Create only if required: `docs/security/audit-exceptions.md`
- Modify: `pnpm-lock.yaml` only if dependency attempts changed it

**Interfaces:**

- Consumes: evidence that a patched upgrade or override is unavailable or breaks a required supported contract.
- Produces: one documented, GHSA-specific temporary exception.

**Skip this task entirely when `pnpm audit --audit-level high` passes after Tasks 2–4.**

- [ ] **Step 1: Establish that suppression is genuinely necessary.**

Suppression is allowed only when all are true:

1. `pnpm audit` still reports the advisory after parent upgrades;
2. the advisory has no installable patched version compatible with the parent dependency graph, or the patched override demonstrably breaks Relay tests/contracts;
3. the failure evidence is recorded in the PR comment;
4. no unrelated advisory is suppressed.

- [ ] **Step 2: Create the exception record.**

Create `docs/security/audit-exceptions.md` with this exact structure for each exception:

```markdown
# Dependency Audit Exceptions

## GHSA-<exact-id>

- Package: `<package>@<resolved-version>`
- Dependency path: `<complete pnpm why path>`
- Added: 2026-08-06
- Review by: 2026-09-06
- Reason upgrade is unavailable: `<specific registry or compatibility evidence>`
- Relay exposure: `<runtime or development-only, reachable surface, and compensating control>`
- Removal condition: `<exact parent or patched version that allows removal>`
- Verification: `pnpm audit --audit-level high`, `pnpm verify`
```

Do not write vague reasons such as “transitive dependency” or “false positive.”

- [ ] **Step 3: Add only the exact GHSA to pnpm audit configuration.**

Add to the existing `pnpm` object:

```json
{
  "pnpm": {
    "auditConfig": {
      "ignoreGhsas": ["GHSA-<exact-id>"]
    }
  }
}
```

Do not add low/moderate unrelated advisories and do not use `ignoreCves` when the audit identifies a GHSA.

- [ ] **Step 4: Prove the suppression is narrow.**

Run:

```bash
pnpm audit --json > .artifacts/audit/after-exception.json
pnpm audit --audit-level high
```

Expected:

- audit exits 0;
- the ignored advisory is the only high advisory omitted;
- a newly introduced high advisory would still fail the command.

- [ ] **Step 5: Commit the exception independently.**

```bash
git add package.json docs/security/audit-exceptions.md pnpm-lock.yaml
git commit -m "chore: document temporary dependency audit exception"
```

---

### Task 6: Run reproducibility, full verification, and installed-package gates

**Files:**

- Verify: `package.json`
- Verify: `pnpm-lock.yaml`
- Verify if created: `docs/security/audit-exceptions.md`

**Interfaces:**

- Consumes: final dependency graph.
- Produces: merge-readiness evidence.

- [ ] **Step 1: Verify a clean frozen installation.**

Run:

```bash
rm -rf node_modules
pnpm install --frozen-lockfile
```

Expected: PASS with no lockfile changes.

- [ ] **Step 2: Run the full repository gate.**

Run:

```bash
pnpm verify
```

Expected: PASS, including `pnpm audit --audit-level high`.

- [ ] **Step 3: Run installed-package verification.**

Run:

```bash
RELAY_RUN_PACKAGE_SMOKE=1 pnpm verify:package
```

Expected: PASS for CLI, MCP, UI, doctor, signals, and arbitrary-CWD package behavior.

- [ ] **Step 4: Inspect final dependency resolution.**

Run:

```bash
pnpm list @modelcontextprotocol/sdk fast-uri ip-address brace-expansion --depth Infinity
pnpm audit --audit-level high
git diff main...HEAD -- package.json pnpm-lock.yaml docs/security/audit-exceptions.md
```

Expected:

- MCP SDK is stable `1.30.x` according to the declared range;
- vulnerable patched floors are respected;
- no unrelated direct dependency upgrades;
- no audit exception file exists unless Task 5 was genuinely required.

- [ ] **Step 5: Ensure the working tree is clean.**

Run:

```bash
git status --short
```

Expected: no uncommitted files.

---

### Task 7: Push and verify GitHub Actions

**Files:**

- No additional source changes.

**Interfaces:**

- Consumes: locally verified commits.
- Produces: final CI evidence on the exact PR head.

- [ ] **Step 1: Push the branch.**

```bash
git push origin feature/issue-42-relay-doctor-diagnostics
```

- [ ] **Step 2: Confirm GitHub Actions runs against the new head SHA.**

Run:

```bash
git rev-parse HEAD
```

Match this SHA to the PR head and CI checkout.

- [ ] **Step 3: Verify every CI step.**

The `verify` job must show success for:

- dependency install;
- formatting;
- lint;
- typecheck;
- tests and coverage;
- build;
- package metadata;
- asset validation;
- `pnpm audit --audit-level high`;
- subsequent MCPB/package steps configured by the workflow.

- [ ] **Step 4: Add a PR remediation comment.**

The comment must list:

- direct dependencies upgraded;
- each transitive override added and why;
- whether any GHSA suppression was required;
- exact `pnpm verify` result;
- exact GitHub Actions run ID and conclusion.

Do not state “CI green” until the workflow conclusion is `success`.

## Human Review Checkpoints

1. Confirm the MCP SDK change is stable `1.30.x`, not a 2.x alpha package.
2. Confirm overrides are version-scoped and do not force legacy major consumers onto incompatible versions.
3. Confirm `pnpm-lock.yaml` contains no vulnerable `fast-uri@3.1.4`, `ip-address@10.2.2`, or `brace-expansion@5.0.8` path covered by the high advisories.
4. Confirm MCP stdio, tool discovery, doctor MCP probe, HTTP, and installed-package tests still pass.
5. Confirm suppression was not used when patched versions passed verification.
6. If suppression exists, confirm the exact GHSA, review date, exposure analysis, and removal condition are documented.
7. Confirm the final GitHub Actions run is green on the exact PR head.
