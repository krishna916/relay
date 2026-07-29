# Issue #24 Agent Integration Assets Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add thin, reversible source-checkout integration assets for Codex, Claude Code, generic MCP clients, and generic CLI-capable agents without duplicating Relay product logic or canonical skill policy.

**Architecture:** Keep one canonical Relay MCP process at `dist/mcp/main.js` and one source-checkout CLI at `dist/cli/main.js`. Vendor directories contain only configuration examples and short operational guidance; they reference the canonical skills and contract documents already delivered by issues #19–#23 and #26. A focused repository-asset validator enforces structure and policy-drift constraints deterministically.

**Tech Stack:** Node.js 24.x, pnpm 10.2.0, TypeScript 5.9, Vitest 4, official MCP TypeScript SDK, Markdown, TOML, JSON.

## Global Constraints

- Issue #24 depends on #19, #20, #26, #21, #22, and #23; do not begin implementation until those changes are present on the working branch.
- Verify current official Codex and Claude Code documentation immediately before finalising vendor-specific syntax.
- Record the verification date, exact client versions, official source links, commands tested, and limitations honestly.
- Use one canonical MCP server; do not create vendor-specific servers or duplicate application logic.
- Canonical behaviour remains in `skills/relay-capture/SKILL.md` and `skills/relay-session-review/SKILL.md`; vendor assets only reference those files.
- Use source-checkout invocations only: development through `pnpm dev:mcp`, built MCP through `node <absolute-checkout-path>/dist/mcp/main.js`, and built CLI through `node <absolute-checkout-path>/dist/cli/main.js`.
- `relay mcp` is future packaged behaviour owned by Epic #18 and must be labelled unavailable in this issue.
- Do not automatically mutate user configuration, install globally, add setup/doctor commands, publish marketplace assets, add a daemon, add remote access, add auth, or delete data.
- Every first-run validation must use an isolated `RELAY_DB_PATH`.
- MCP stdout must remain protocol-clean; operational diagnostics belong on stderr.
- `pnpm verify` is the authoritative final quality gate and must remain non-mutating.

---

## Planned File Map

### New production assets

- `integrations/codex/config.toml.example` — verified Codex stdio MCP configuration template using a visible checkout-path token.
- `integrations/codex/README.md` — Codex setup, skill reference, validation, CLI fallback, disable, and removal steps.
- `integrations/claude-code/.mcp.json.example` — verified Claude Code project-scope stdio template.
- `integrations/claude-code/README.md` — Claude Code setup using its native MCP and instruction mechanisms.
- `integrations/generic-mcp/server-config.json.example` — vendor-neutral command/args/env template with no shell interpolation assumptions.
- `integrations/generic-mcp/README.md` — protocol requirements and expected Relay tool discovery.
- `integrations/generic-cli/README.md` — JSON CLI fallback, provenance/session rules, representative commands, and exit codes.
- `docs/agent-integration.md` — shared source-checkout setup, compatibility record, validation workflow, and clean removal semantics.
- `docs/troubleshooting-agent-integration.md` — required failure diagnosis without data-destructive advice.

### New validation code

- `scripts/validate-agent-integration-assets.ts` — focused integration-asset validator.
- `tests/unit/scripts/validate-agent-integration-assets.test.ts` — isolated positive and negative validator tests.
- `tests/fixtures/agent-integrations/valid/` — minimal valid asset tree for validator tests.

### Existing files to modify

- `scripts/validate-repository-assets.ts` — invoke the new validator; do not absorb all integration rules into this already broad file.
- `tests/unit/scripts/validate-repository-assets.test.ts` — update its fixture root so aggregate validation includes the new required integration assets.
- `README.md` — add one concise link to the integration guide; do not duplicate setup documentation.

---

### Task 1: Verify dependency contracts and current vendor documentation

**Files:**

- Read: `package.json`
- Read: `docs/mcp-tools.md`
- Read: `docs/cli-reference.md`
- Read: `docs/session-semantics.md`
- Read: `docs/agent-skills.md`
- Read: `skills/relay-capture/SKILL.md`
- Read: `skills/relay-session-review/SKILL.md`
- Create: `docs/agent-integration.md`

**Interfaces:**

- Consumes: built MCP entry `dist/mcp/main.js`, built CLI entry `dist/cli/main.js`, `relay_health`, `task_capture`, `task_list`, `task_get`, `task_find_similar`, `session_captures_list`, and the ten CLI task/session commands documented in `docs/cli-reference.md`.
- Produces: a compatibility section that later vendor README files link to rather than re-state.

- [ ] **Step 1: Confirm all issue dependencies are present**

Run:

```bash
test -f docs/mcp-tools.md
test -f docs/cli-reference.md
test -f docs/session-semantics.md
test -f skills/relay-capture/SKILL.md
test -f skills/relay-session-review/SKILL.md
pnpm build:node
test -f dist/mcp/main.js
test -f dist/cli/main.js
```

Expected: every command exits `0`. Stop and report the missing dependency instead of planning around absent contracts.

- [ ] **Step 2: Verify official Codex documentation**

Check only current official OpenAI documentation for:

- `config.toml` location and project/user precedence,
- `[mcp_servers.<name>]` stdio command, args, cwd, and env syntax,
- the supported mechanism for installing or referencing repository skills,
- how Codex reloads configuration and lists/discovers MCP tools.

Record the exact official URLs and verification date in `docs/agent-integration.md`. Do not copy syntax from an issue, blog, or remembered example.

- [ ] **Step 3: Verify official Claude Code documentation**

Check only current official Anthropic documentation for:

- `claude mcp add` stdio syntax and the `--` separator,
- `--scope local|project|user` behaviour and precedence,
- `.mcp.json` structure and environment expansion,
- the current project instruction/skill mechanism,
- `claude mcp list`, `claude mcp get`, `claude mcp remove`, and `/mcp` validation behaviour.

Record the exact official URLs and verification date in `docs/agent-integration.md`.

- [ ] **Step 4: Write the shared compatibility and setup skeleton**

Create `docs/agent-integration.md` with these exact top-level sections:

```markdown
# Agent Integration

## Supported source-checkout model

## Compatibility verification

## Prerequisites

## Isolated validation database

## Canonical MCP and CLI entry points

## Session and provenance example

## Validation workflow

## Disable and removal semantics

## Current limitations
```

Under compatibility verification, use a table with columns `Client`, `Version tested`, `Verified on`, `Official sources`, and `Limitations`.

- [ ] **Step 5: Commit the compatibility baseline**

```bash
git add docs/agent-integration.md
git commit -m "docs: record agent integration compatibility baseline"
```

---

### Task 2: Add failing integration-asset validator tests

**Files:**

- Create: `scripts/validate-agent-integration-assets.ts`
- Create: `tests/unit/scripts/validate-agent-integration-assets.test.ts`
- Create: `tests/fixtures/agent-integrations/valid/integrations/**`
- Create: `tests/fixtures/agent-integrations/valid/docs/**`

**Interfaces:**

- Produces: `validateAgentIntegrationAssets(options?: { readonly rootDir?: string }): void`.
- Consumes: canonical paths and tool names from Task 1.

- [ ] **Step 1: Write the validator API stub**

```ts
export interface ValidateAgentIntegrationAssetsOptions {
  readonly rootDir?: string;
}

export function validateAgentIntegrationAssets(
  _options: ValidateAgentIntegrationAssetsOptions = {},
): void {
  throw new Error('Agent integration asset validation is not implemented.');
}
```

- [ ] **Step 2: Write failing tests for required assets**

Test that validation rejects a fixture missing each required directory/file and accepts the complete fixture. Required paths are the nine production assets listed in the file map.

- [ ] **Step 3: Write failing tests for deterministic content rules**

Add one focused test per rule:

```text
reject machine-specific absolute paths such as C:\Users\name or /Users/name
reject missing references to both canonical SKILL.md files
reject missing expected MCP tool names
reject copied behavioural-policy headings such as "Autonomy boundaries"
reject removal guidance that does not explicitly preserve the SQLite database
reject an unqualified "relay mcp" packaged command
reject invalid JSON in *.json.example after replacing the documented checkout token
reject invalid TOML in config.toml.example after replacing the documented checkout token
```

Use the single token `__RELAY_CHECKOUT__` for checkout substitution. It is visible, deterministic, and does not trip the repository-wide unresolved-placeholder check.

- [ ] **Step 4: Run tests and verify failure**

```bash
pnpm vitest run tests/unit/scripts/validate-agent-integration-assets.test.ts
```

Expected: FAIL because the validator stub throws.

- [ ] **Step 5: Commit the red tests**

```bash
git add scripts/validate-agent-integration-assets.ts tests/unit/scripts/validate-agent-integration-assets.test.ts tests/fixtures/agent-integrations
git commit -m "test: define agent integration asset validation"
```

---

### Task 3: Implement generic MCP and CLI assets first

**Files:**

- Create: `integrations/generic-mcp/server-config.json.example`
- Create: `integrations/generic-mcp/README.md`
- Create: `integrations/generic-cli/README.md`
- Modify: `docs/agent-integration.md`

**Interfaces:**

- Consumes: `node __RELAY_CHECKOUT__/dist/mcp/main.js`, optional `RELAY_DB_PATH`, canonical MCP tool names, and CLI commands from `docs/cli-reference.md`.
- Produces: vendor-neutral examples reused by vendor READMEs through links.

- [ ] **Step 1: Add the generic MCP JSON template**

Use a parseable JSON object with this shape:

```json
{
  "command": "node",
  "args": ["__RELAY_CHECKOUT__/dist/mcp/main.js"],
  "env": {
    "RELAY_DB_PATH": "__RELAY_CHECKOUT__/.relay-validation/relay.db"
  }
}
```

Document that clients may omit `env` to use Relay's platform-default database, but validation must use the isolated path.

- [ ] **Step 2: Document generic MCP behaviour**

`integrations/generic-mcp/README.md` must cover command/args separation, no shell interpolation, protocol-clean stdout, expected tools, restart/reload, disposable capture and exact-session retrieval, and config-only removal.

- [ ] **Step 3: Document generic CLI fallback**

Include exact representative commands for:

```bash
node __RELAY_CHECKOUT__/dist/cli/main.js task capture --title "Disposable integration check" --agent generic-cli --session relay-check-20260729-001 --workspace relay --source-context "Issue 24 validation" --output json
node __RELAY_CHECKOUT__/dist/cli/main.js session captures --session relay-check-20260729-001 --output json
node __RELAY_CHECKOUT__/dist/cli/main.js task triage TASK_ID --to BACKLOG --output json
node __RELAY_CHECKOUT__/dist/cli/main.js task complete TASK_ID --output json
node __RELAY_CHECKOUT__/dist/cli/main.js task archive TASK_ID --output json
```

State that autonomous capture uses `task capture`, while edit/triage/start/complete/archive require explicit user direction. Link to canonical skills instead of restating their policy sections.

- [ ] **Step 4: Run the focused tests**

```bash
pnpm vitest run tests/unit/scripts/validate-agent-integration-assets.test.ts
```

Expected: still FAIL only for not-yet-created vendor assets or unimplemented validator rules.

- [ ] **Step 5: Commit generic assets**

```bash
git add integrations/generic-mcp integrations/generic-cli docs/agent-integration.md
git commit -m "docs: add generic MCP and CLI integration assets"
```

---

### Task 4: Add and manually validate Codex assets

**Files:**

- Create: `integrations/codex/config.toml.example`
- Create: `integrations/codex/README.md`
- Modify: `docs/agent-integration.md`

**Interfaces:**

- Consumes: verified Codex syntax from Task 1, generic MCP/CLI docs from Task 3, and both canonical skills.
- Produces: a minimal Codex-specific wrapper with no copied lifecycle policy.

- [ ] **Step 1: Create the verified TOML template**

Use the official Codex field names verified in Task 1. Configure one stdio server named `relay`, command `node`, argument `__RELAY_CHECKOUT__/dist/mcp/main.js`, and isolated `RELAY_DB_PATH`. Do not invent fields not present in current official docs.

- [ ] **Step 2: Write Codex setup and removal guidance**

Cover:

1. build from source,
2. replace `__RELAY_CHECKOUT__` with an absolute path,
3. create an isolated database directory,
4. manually add the config at the verified scope,
5. reference/install the two canonical skills using the verified Codex mechanism,
6. reload Codex,
7. confirm `relay_health` and all five task tools,
8. capture and retrieve one exact-session task,
9. show the JSON CLI fallback,
10. disable/remove only the Relay config and skill references,
11. confirm the database file remains.

- [ ] **Step 3: Perform clean-checkout manual validation**

Record in `docs/agent-integration.md`:

```text
Codex version
operating system
checkout commit SHA
config scope used
exact MCP start command
exact tool-discovery evidence
session ID used
database path used
removal check result
limitations observed
```

- [ ] **Step 4: Run focused validation**

```bash
pnpm vitest run tests/unit/scripts/validate-agent-integration-assets.test.ts
```

Expected: Codex-related cases PASS.

- [ ] **Step 5: Commit Codex assets**

```bash
git add integrations/codex docs/agent-integration.md
git commit -m "docs: add verified Codex integration assets"
```

---

### Task 5: Add and manually validate Claude Code assets

**Files:**

- Create: `integrations/claude-code/.mcp.json.example`
- Create: `integrations/claude-code/README.md`
- Modify: `docs/agent-integration.md`

**Interfaces:**

- Consumes: verified Claude Code syntax from Task 1, generic MCP/CLI docs, and both canonical skills.
- Produces: a Claude-native wrapper rather than a Codex-shaped translation.

- [ ] **Step 1: Create the verified `.mcp.json` example**

Use the current official Claude Code schema with one stdio server named `relay`, `command: "node"`, `args: ["__RELAY_CHECKOUT__/dist/mcp/main.js"]`, and isolated `RELAY_DB_PATH`.

- [ ] **Step 2: Document native Claude setup**

Include both supported manual paths only when confirmed by current docs:

- a `claude mcp add ... -- node ...` command using the correct `--scope`, and
- manual `.mcp.json` configuration.

Explain scope precedence, project approval/reload behaviour, the current instruction/skill reference mechanism, `/mcp`, `claude mcp list`, `claude mcp get relay`, and `claude mcp remove relay`.

- [ ] **Step 3: Perform clean-checkout manual validation**

Record the same evidence fields as Codex, using the actual Claude Code version and scope.

- [ ] **Step 4: Run focused validation**

```bash
pnpm vitest run tests/unit/scripts/validate-agent-integration-assets.test.ts
```

Expected: all required-asset and vendor-template cases PASS once the validator is implemented.

- [ ] **Step 5: Commit Claude Code assets**

```bash
git add integrations/claude-code docs/agent-integration.md
git commit -m "docs: add verified Claude Code integration assets"
```

---

### Task 6: Implement the focused validator and aggregate wiring

**Files:**

- Modify: `scripts/validate-agent-integration-assets.ts`
- Modify: `scripts/validate-repository-assets.ts`
- Modify: `tests/unit/scripts/validate-agent-integration-assets.test.ts`
- Modify: `tests/unit/scripts/validate-repository-assets.test.ts`

**Interfaces:**

- Produces: deterministic validation called by `pnpm validate:assets` through `validateRepositoryAssets()`.
- Consumes: all integration assets from Tasks 3–5.

- [ ] **Step 1: Implement required-path validation**

Resolve `rootDir`, check every required integration path with `existsSync`, and throw errors prefixed with `[AGENT INTEGRATION ASSET FAILURE]`.

- [ ] **Step 2: Implement template parsing**

Replace every `__RELAY_CHECKOUT__` token with `/tmp/relay-checkout` before parsing. Use `JSON.parse` for JSON examples. Add the smallest maintained TOML parser dependency only if the repository has no TOML parser; otherwise use the existing parser. Do not validate TOML with regex alone.

- [ ] **Step 3: Implement content rules**

Walk only `integrations/`, `docs/agent-integration.md`, and `docs/troubleshooting-agent-integration.md`. Enforce:

- no machine-specific paths,
- both canonical skill paths referenced from each vendor README,
- all six expected MCP tool names present in the shared or generic MCP docs,
- forbidden copied policy headings absent from vendor assets,
- removal sections contain `database remains` or `preserve` plus `database`,
- every occurrence of `relay mcp` is adjacent to `future`, `not available`, or `Epic #18`.

Keep the checks explicit and readable; do not build a generic document-policy framework.

- [ ] **Step 4: Wire aggregate validation**

Add:

```ts
import { validateAgentIntegrationAssets } from './validate-agent-integration-assets.js';
```

and invoke it immediately after `validateSkillAssets({ rootDir })`.

- [ ] **Step 5: Update aggregate fixture setup**

Extend `createFixtureRoot()` in `tests/unit/scripts/validate-repository-assets.test.ts` with the minimal valid integration fixture. Add one aggregate test that removes `integrations/codex/config.toml.example` and expects `validateRepositoryAssets()` to reject it.

- [ ] **Step 6: Run unit tests**

```bash
pnpm vitest run tests/unit/scripts/validate-agent-integration-assets.test.ts tests/unit/scripts/validate-repository-assets.test.ts
```

Expected: PASS.

- [ ] **Step 7: Commit validator implementation**

```bash
git add scripts/validate-agent-integration-assets.ts scripts/validate-repository-assets.ts tests/unit/scripts/validate-agent-integration-assets.test.ts tests/unit/scripts/validate-repository-assets.test.ts tests/fixtures/agent-integrations
git commit -m "test: validate agent integration assets"
```

---

### Task 7: Add shared troubleshooting and README entry point

**Files:**

- Create: `docs/troubleshooting-agent-integration.md`
- Modify: `docs/agent-integration.md`
- Modify: `README.md`

**Interfaces:**

- Consumes: real build commands, database semantics, client validation evidence, and stable CLI errors.
- Produces: one shared diagnosis guide linked from all integration READMEs.

- [ ] **Step 1: Write troubleshooting cases**

Use one section per required case:

```markdown
## Node 24 or pnpm 10.2.0 mismatch

## Missing dist/mcp/main.js or dist/cli/main.js

## Incorrect absolute checkout path

## better-sqlite3 native installation failure

## Malformed client configuration

## MCP process exits immediately

## MCP stdout contamination

## Different RELAY_DB_PATH values

## Malformed or reused session ID

## CLI JSON parsing mistakes

## Removing an integration without deleting task data
```

Each section must contain `Symptom`, `Check`, and `Resolution`. No resolution may recommend deleting the default database.

- [ ] **Step 2: Finish the shared setup/remove workflow**

Ensure every integration path follows the eight-step issue requirement and explicitly says that removing config or skill references does not remove the SQLite database.

- [ ] **Step 3: Add one README link**

Add a concise `Agent integrations` paragraph linking to `docs/agent-integration.md` and `docs/troubleshooting-agent-integration.md`. Keep command details in the dedicated docs.

- [ ] **Step 4: Run formatting and focused tests**

```bash
pnpm format
pnpm vitest run tests/unit/scripts/validate-agent-integration-assets.test.ts tests/unit/scripts/validate-repository-assets.test.ts
```

Expected: PASS.

- [ ] **Step 5: Commit documentation**

```bash
git add README.md docs/agent-integration.md docs/troubleshooting-agent-integration.md integrations
git commit -m "docs: complete agent integration setup and troubleshooting"
```

---

### Task 8: Final verification and human review evidence

**Files:**

- Modify only if verification exposes a concrete defect in issue #24 assets.
- Update: PR description with manual validation evidence and official sources.

**Interfaces:**

- Produces: a reviewable PR that satisfies the automated and manual acceptance gates.

- [ ] **Step 1: Scan for forbidden scope and unresolved markers**

```bash
git grep -n -E 'unresolved-placeholder|npm install -g|automatic.*config|doctor command|marketplace|daemon|delete.*relay\.db' -- integrations docs/agent-integration.md docs/troubleshooting-agent-integration.md
```

Expected: no forbidden implementation guidance. Legitimate negative statements must be reviewed manually rather than blindly removed.

- [ ] **Step 2: Run the authoritative gate**

```bash
pnpm verify
```

Expected: format check, lint, typecheck, coverage, build, asset validation, and audit all PASS.

- [ ] **Step 3: Repeat manual Codex and Claude Code smoke tests from a clean checkout**

For each client, prove:

1. `relay_health` is discoverable and succeeds,
2. all five task tools are discoverable,
3. one disposable `task_capture` succeeds,
4. `session_captures_list` returns that exact session,
5. config/skill removal disables Relay,
6. the isolated SQLite database still exists and retains the task.

- [ ] **Step 4: Complete the PR evidence**

Include:

```markdown
## Official documentation verification

## Codex manual validation

## Claude Code manual validation

## Generic MCP/CLI validation

## Automated verification

## Known limitations

## Data-preserving removal check
```

- [ ] **Step 5: Human review gates**

The human reviewer must independently confirm:

- official-doc verification is dated and current,
- each setup works without hidden local knowledge,
- all adapters point to one canonical MCP server and one intended database,
- vendor wrappers reference canonical skills without policy drift,
- removal leaves task data untouched.

- [ ] **Step 6: Final commit if verification required fixes**

```bash
git add README.md docs integrations scripts tests package.json pnpm-lock.yaml
git commit -m "fix: satisfy agent integration acceptance gates"
```

Do not create an empty commit when no fixes were required.

---

## AI Delegation Notes for Luna

- Execute one task at a time and preserve commit boundaries.
- Do not let a subagent choose vendor syntax from memory; Task 1 evidence is a hard gate.
- Do not broaden Task 6 into a generic documentation framework.
- Do not copy canonical skill prose into vendor READMEs; link to it.
- Do not change MCP or CLI runtime contracts to make documentation easier. A discovered mismatch must be raised as a dependency defect.
- Pause for human review after Tasks 1, 4, 5, and 8.
- Before claiming completion, attach the exact `pnpm verify` output and manual client versions to the PR.
