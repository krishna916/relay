# Issue #23 Canonical Relay Skills Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add canonical vendor-neutral Relay Capture and Relay Session Review skills, deterministic policy fixtures, repository validation, and documentation without duplicating Relay business logic or vendor packaging.

**Architecture:** The two `SKILL.md` files are the only canonical behaviour-policy sources. Markdown fixtures encode accepted and rejected agent behaviour as structured examples, while a focused TypeScript validator enforces required sections, safety invariants, fixture shape, and canonical-source boundaries deterministically. Skills reference the existing MCP, CLI, and session contract documents rather than copying schemas or lifecycle rules.

**Tech Stack:** Markdown, TypeScript, Node.js 24, Vitest, pnpm, existing repository asset validation.

## Global Constraints

- Issue #23 starts only after #20, #26, #21, and #22 are merged and reviewed; all four dependencies are closed as completed.
- Create exactly one canonical source for Relay Capture and one for Relay Session Review.
- MCP is preferred for supported interactive clients; CLI JSON is the deterministic fallback for unsupported clients, scripts, debugging, or explicit one-shot use.
- An agent keeps one adapter for a workflow and does not switch MCP/CLI without a concrete reason.
- Autonomous capture may create only `INBOX` tasks and must not edit, triage, start, complete, or archive existing tasks.
- Session review uses the exact active session ID and includes every status returned by Relay, including completed and archived captures.
- Disposition mutations require explicit user direction and use intent-specific capabilities only.
- Store concise provenance and source context; never store prompts, transcripts, source files, secrets, credentials, large stack traces, or oversized context.
- Duplicate candidates are advisory and never silently suppress capture.
- Skills define agent behaviour only; do not implement MCP/CLI handlers, persistence, lifecycle rules, vendor configuration, packaging, a policy engine, or live-LLM CI.
- `pnpm verify` is the final acceptance gate and must remain non-mutating.

---

## File Map

- `skills/relay-capture/SKILL.md`: canonical policy for discovering and capturing actionable follow-up work.
- `skills/relay-session-review/SKILL.md`: canonical policy for reviewing captures before final completion and applying only user-directed dispositions.
- `skills/fixtures/capture-positive.md`: parseable accepted capture examples, including duplicate and CLI fallback cases.
- `skills/fixtures/capture-negative.md`: parseable rejected capture examples covering speculation, sensitive context, unsafe mutation, and adapter switching.
- `skills/fixtures/session-review-positive.md`: parseable accepted session-review and explicit-disposition examples.
- `skills/fixtures/session-review-negative.md`: parseable rejected session-review examples covering wrong sessions, omitted review, hidden mutation, and timer inference.
- `scripts/validate-skill-assets.ts`: focused deterministic parser and semantic invariant validator for canonical skill assets.
- `tests/unit/scripts/validate-skill-assets.test.ts`: isolated fixture-root tests for required paths, sections, positive/negative fixtures, forbidden policy, and vendor-source boundaries.
- `scripts/validate-repository-assets.ts`: require canonical skill assets, invoke the focused validator, and remove the obsolete scaffold-wide `SKILL.md` prohibition.
- `tests/unit/scripts/validate-repository-assets.test.ts`: update repository fixture setup and regression expectations.
- `README.md`: link the canonical skills and explain capability-versus-behaviour separation.
- `docs/agent-skills.md`: document canonical sources, MCP/CLI selection, fixture format, validation, and vendor-copy rules.
- `package.json`: add a non-mutating focused validation script and include it in `verify` only if `verify` does not already execute repository asset validation.

---

### Task 1: Add a focused failing validator contract

**Files:**

- Create: `scripts/validate-skill-assets.ts`
- Create: `tests/unit/scripts/validate-skill-assets.test.ts`
- Modify: `scripts/validate-repository-assets.ts`
- Modify: `tests/unit/scripts/validate-repository-assets.test.ts`

**Interfaces:**

- Consumes: a repository root containing canonical Markdown assets.
- Produces: `validateSkillAssets(options?: { readonly rootDir?: string }): void`.
- Produces fixture parsing with this exact logical shape:

```ts
interface SkillFixtureCase {
  readonly id: string;
  readonly expected: 'ACCEPT' | 'REJECT';
  readonly scenario: string;
  readonly agentAction: string;
  readonly reason: string;
}
```

- [ ] **Step 1: Write failing isolated tests for canonical paths and fixture parsing.**

Create a temporary fixture root helper that writes the six expected files. Each fixture case must use this exact Markdown structure so parsing is deterministic:

```md
## CAPTURE-ACTIONABLE-001

Expected: ACCEPT

### Scenario

A regression gap is discovered while implementing session expiry.

### Agent action

Capture a concise follow-up task and continue the original work.

### Reason

The work is concrete, actionable, and safely deferred.
```

Add tests equivalent to:

```ts
it('requires both canonical skill files and four fixture files', () => {
  const rootDir = createValidSkillFixtureRoot();
  rmSync(join(rootDir, 'skills/relay-capture/SKILL.md'));

  expect(() => validateSkillAssets({ rootDir })).toThrow(/relay-capture\/SKILL\.md/i);
});

it('rejects malformed fixture cases', () => {
  const rootDir = createValidSkillFixtureRoot();
  writeFileSync(
    join(rootDir, 'skills/fixtures/capture-positive.md'),
    '## CAPTURE-BROKEN-001\n\nExpected: ACCEPT\n',
  );

  expect(() => validateSkillAssets({ rootDir })).toThrow(/Scenario|Agent action|Reason/i);
});
```

- [ ] **Step 2: Run the focused test and verify failure because the validator does not exist.**

Run:

```bash
pnpm test -- tests/unit/scripts/validate-skill-assets.test.ts
```

Expected: FAIL with a module-not-found or missing-export error for `validate-skill-assets`.

- [ ] **Step 3: Implement path checks and a strict Markdown fixture parser.**

Use exact required paths:

```ts
const canonicalSkillPaths = [
  'skills/relay-capture/SKILL.md',
  'skills/relay-session-review/SKILL.md',
] as const;

const fixturePaths = [
  'skills/fixtures/capture-positive.md',
  'skills/fixtures/capture-negative.md',
  'skills/fixtures/session-review-positive.md',
  'skills/fixtures/session-review-negative.md',
] as const;
```

The parser must:

- split cases on `## <ID>` headings;
- require exactly one `Expected: ACCEPT|REJECT` line;
- require non-empty `### Scenario`, `### Agent action`, and `### Reason` sections;
- reject duplicate IDs across all four files;
- require every case in `*-positive.md` to be `ACCEPT`;
- require every case in `*-negative.md` to be `REJECT`;
- reject a fixture file with zero cases.

Export only `validateSkillAssets`; keep parsing helpers module-private unless tests need a narrow exported parser.

- [ ] **Step 4: Replace the obsolete scaffold prohibition with focused skill validation.**

In `scripts/validate-repository-assets.ts`:

- add the six canonical skill/fixture paths and `docs/agent-skills.md` to `requiredPaths`;
- import and call `validateSkillAssets({ rootDir })` after `allFiles` is calculated;
- remove `'SKILL.md'` from the Issue #1 forbidden list;
- retain only genuinely forbidden legacy directories such as `agent/skills` and `agent/mcp` until a later issue deliberately changes them;
- rename the comment from `No SKILL.md or agent configs in #1` to a current invariant such as `No legacy agent integration roots`.

Update `createFixtureRoot()` in `validate-repository-assets.test.ts` to create valid minimal canonical skill and fixture assets, then add this regression:

```ts
it('accepts canonical skills but rejects legacy agent policy roots', () => {
  const rootDir = createFixtureRoot();
  mkdirSync(join(rootDir, 'agent/skills'), { recursive: true });

  expect(() => validateRepositoryAssets({ rootDir })).toThrow(/legacy|agent\/skills/i);
});
```

- [ ] **Step 5: Run both focused validators.**

Run:

```bash
pnpm test -- tests/unit/scripts/validate-skill-assets.test.ts tests/unit/scripts/validate-repository-assets.test.ts
```

Expected: PASS.

- [ ] **Step 6: Commit the validator contract.**

```bash
git add scripts/validate-skill-assets.ts scripts/validate-repository-assets.ts tests/unit/scripts/validate-skill-assets.test.ts tests/unit/scripts/validate-repository-assets.test.ts
git commit -m "test: define canonical skill asset validation"
```

---

### Task 2: Write the canonical Relay Capture skill and fixtures

**Files:**

- Create: `skills/relay-capture/SKILL.md`
- Create: `skills/fixtures/capture-positive.md`
- Create: `skills/fixtures/capture-negative.md`
- Modify: `scripts/validate-skill-assets.ts`
- Modify: `tests/unit/scripts/validate-skill-assets.test.ts`

**Interfaces:**

- Consumes: `task_capture`, `task_find_similar`, `docs/mcp-tools.md`, `docs/cli-reference.md`, and `docs/session-semantics.md`.
- Produces: canonical capture-policy sections named `Purpose`, `When to capture`, `Adapter selection`, `Session and provenance`, `Capture procedure`, `Duplicate handling`, `Context safety`, `Autonomy boundaries`, and `Do not capture`.

- [ ] **Step 1: Add failing semantic tests for mandatory Capture sections and policy statements.**

Use section-aware checks rather than one giant exact-string comparison. Tests must prove the capture skill contains policy equivalent to all of these invariants:

```ts
expect(capture.sections).toContain('When to capture');
expect(capture.sections).toContain('Adapter selection');
expect(capture.content).toMatch(/concrete, actionable follow-up/i);
expect(capture.content).toMatch(/MCP.*preferred/i);
expect(capture.content).toMatch(/CLI.*fallback/i);
expect(capture.content).toMatch(/JSON/i);
expect(capture.content).toMatch(/same adapter|one adapter/i);
expect(capture.content).toMatch(/session ID/i);
expect(capture.content).toMatch(/INBOX/i);
expect(capture.content).toMatch(/duplicate.*advisory/i);
expect(capture.content).toMatch(/continue.*original work/i);
expect(capture.content).toMatch(/must not.*(?:edit|triage|start|complete|archive)/i);
```

Also assert that the skill links to the three contract documents using relative Markdown links and does not contain copied command-option tables or JSON schema blocks.

- [ ] **Step 2: Run the focused tests and verify failure because capture assets are absent or incomplete.**

```bash
pnpm test -- tests/unit/scripts/validate-skill-assets.test.ts
```

- [ ] **Step 3: Write `skills/relay-capture/SKILL.md`.**

Start with valid skill frontmatter and concise trigger guidance:

```md
---
name: relay-capture
description: Use while doing another task when concrete follow-up work should be captured in Relay without interrupting the current workflow.
---
```

The procedure must direct the agent to:

1. Decide whether the discovered work is concrete, actionable, and safely deferrable.
2. Keep the current workflow adapter: use MCP for supported interactive clients; otherwise use the built CLI with `--output json`.
3. Generate one valid session ID for the active agent session or reuse the already-established ID; never reuse it across unrelated concurrent sessions.
4. Search for likely duplicates using `task_find_similar` or the matching CLI command when practical.
5. Call `task_capture` or `relay task capture` with a concise title, agent name, exact session ID, optional workspace, and limited source context.
6. Treat duplicate candidates as advisory; capture still occurs unless the user explicitly directs reuse or cancellation.
7. Leave the autonomously created task in `INBOX`.
8. Continue the original work without presenting a separate interruption after every capture.
9. Retain the captured task ID for session-end review when available, but treat Relay's exact session query as authoritative.

The skill must explicitly prohibit:

- speculative ideas and vague reminders;
- full prompts, transcripts, source files, secrets, credentials, large stack traces, or oversized context;
- autonomous edit, triage, start, complete, archive, or delete actions;
- switching MCP and CLI mid-workflow merely because both are available;
- parsing human/decorative CLI output instead of JSON.

Link rather than duplicate:

```md
See [MCP tool contracts](../../docs/mcp-tools.md), [CLI contract reference](../../docs/cli-reference.md), and [session semantics](../../docs/session-semantics.md).
```

- [ ] **Step 4: Add positive capture fixtures.**

Include at least these accepted cases with complete scenario/action/reason sections:

- `CAPTURE-ACTIONABLE-001`: discover a missing regression test, capture it, continue current work.
- `CAPTURE-DUPLICATE-002`: receive a possible-duplicate warning, report it as advisory, and allow the successful capture to stand.
- `CAPTURE-CLI-FALLBACK-003`: MCP is unavailable, use `relay task find-similar ... --output json` and `relay task capture ... --output json` against the same database.
- `CAPTURE-CONTEXT-004`: store a short source-context reference such as `session expiry integration tests`, not code or transcript content.

- [ ] **Step 5: Add negative capture fixtures.**

Include at least these rejected cases:

- `CAPTURE-SPECULATION-001`: capture every thought or possible future enhancement.
- `CAPTURE-SENSITIVE-002`: attach a prompt, source file, credential, secret, or large stack trace.
- `CAPTURE-MUTATION-003`: silently complete/archive/edit an existing task.
- `CAPTURE-TRIAGE-004`: move an autonomous capture from `INBOX` to `ACTIVE` without user direction.
- `CAPTURE-SESSION-005`: share one session ID across unrelated concurrent sessions.
- `CAPTURE-ADAPTER-006`: use MCP for lookup and CLI for capture without a failure or explicit reason.

- [ ] **Step 6: Implement capture-specific semantic guards and run tests.**

The validator must fail when:

- a mandatory Capture section is absent;
- any required policy invariant is absent;
- fewer than three positive or five negative capture cases exist;
- the positive fixture lacks actionable, duplicate-warning, or CLI-fallback coverage;
- the negative fixture lacks sensitive-context, unauthorized-mutation, session-isolation, or adapter-switching coverage.

Run:

```bash
pnpm test -- tests/unit/scripts/validate-skill-assets.test.ts
```

Expected: PASS.

- [ ] **Step 7: Commit the capture skill.**

```bash
git add skills/relay-capture/SKILL.md skills/fixtures/capture-positive.md skills/fixtures/capture-negative.md scripts/validate-skill-assets.ts tests/unit/scripts/validate-skill-assets.test.ts
git commit -m "feat: add canonical Relay capture skill"
```

---

### Task 3: Write the canonical Relay Session Review skill and fixtures

**Files:**

- Create: `skills/relay-session-review/SKILL.md`
- Create: `skills/fixtures/session-review-positive.md`
- Create: `skills/fixtures/session-review-negative.md`
- Modify: `scripts/validate-skill-assets.ts`
- Modify: `tests/unit/scripts/validate-skill-assets.test.ts`

**Interfaces:**

- Consumes: `session_captures_list`, `task_edit`, `task_triage`, `task_start`, `task_complete`, `task_archive`, and their CLI equivalents.
- Produces: canonical review-policy sections named `Purpose`, `When to review`, `Session lookup`, `Review presentation`, `User-directed actions`, `Unresolved captures`, `Adapter selection`, and `Prohibited behaviour`.

- [ ] **Step 1: Add failing semantic tests for mandatory Session Review policy.**

Tests must verify policy equivalent to:

```ts
expect(review.content).toMatch(/before final completion/i);
expect(review.content).toMatch(/exact active session ID/i);
expect(review.content).toMatch(/completed.*archived|archived.*completed/i);
expect(review.content).toMatch(/distinguish.*pre-existing/i);
expect(review.content).toMatch(/explicit user direction/i);
expect(review.content).toMatch(/intent-specific/i);
expect(review.content).toMatch(/unresolved.*INBOX/i);
expect(review.content).toMatch(/never infer.*(?:timer|inactivity|process exit)/i);
expect(review.content).toMatch(/never mix.*session/i);
```

Also test that it links to contract docs rather than embedding full command schemas.

- [ ] **Step 2: Run the focused tests and verify failure.**

```bash
pnpm test -- tests/unit/scripts/validate-skill-assets.test.ts
```

- [ ] **Step 3: Write `skills/relay-session-review/SKILL.md`.**

Use frontmatter:

```md
---
name: relay-session-review
description: Use before final completion or when the user asks to wrap up, to review Relay tasks captured in the exact active agent session.
---
```

The procedure must direct the agent to:

1. Trigger review only before final completion or on explicit prompts such as `wrap up` or `show captured tasks`; never infer completion from timers, inactivity, or process exit.
2. Use the same workflow adapter selected for the session unless it is unavailable for a concrete reason.
3. Call `session_captures_list` with the exact active session ID, or `relay session captures --session <id> --output json` as fallback.
4. Treat Relay's returned ordered list as authoritative and include tasks in every status, including `DONE` and `ARCHIVED`.
5. Present newly captured tasks compactly with ID, title, and current status; clearly label any pre-existing duplicate candidates separately rather than presenting them as new captures.
6. Ask the user to choose only supported explicit actions: leave in Inbox, move to Inbox/Active/Backlog, start, complete, archive, or edit approved fields.
7. Invoke only the matching intent-specific capability for each selected action.
8. Do not mutate unselected tasks; unresolved captures remain in `INBOX`.
9. Report mutation results, including `NO_CHANGE`, conflicts, archived-task restrictions, and errors, without inventing success.

The skill must prohibit:

- querying a guessed or different session ID;
- omitting session review before final completion when captures may exist;
- silently applying dispositions;
- generic status/update commands;
- assuming only Inbox tasks belong in review;
- using timer/inactivity/process-exit heuristics.

- [ ] **Step 4: Add positive review fixtures.**

Include at least:

- `REVIEW-ACTIVE-SESSION-001`: fetch captures with the exact active session ID before final completion and include `INBOX`, `DONE`, and `ARCHIVED` results.
- `REVIEW-EXPLICIT-ACTIONS-002`: present tasks, receive explicit Active/Complete/Archive choices, and invoke only `task_triage`, `task_complete`, and `task_archive` for the selected IDs.
- `REVIEW-UNRESOLVED-003`: user decides only one task; leave every other capture unchanged in `INBOX`.
- `REVIEW-PREEXISTING-004`: show duplicate candidates separately from tasks returned by the active-session capture query.
- `REVIEW-CLI-FALLBACK-005`: use `relay session captures --session <id> --output json` and JSON mutation commands when MCP is unavailable.

- [ ] **Step 5: Add negative review fixtures.**

Include at least:

- `REVIEW-OMITTED-001`: finish the session without querying captures.
- `REVIEW-WRONG-SESSION-002`: query another concurrent session or merge two session IDs.
- `REVIEW-SILENT-MUTATION-003`: move all captures to Active or archive them without explicit choices.
- `REVIEW-INBOX-ONLY-004`: hide completed/archived captures returned by Relay.
- `REVIEW-TIMER-005`: infer wrap-up from inactivity or process exit.
- `REVIEW-GENERIC-MUTATION-006`: use an unrestricted update/status command instead of intent-specific capabilities.

- [ ] **Step 6: Implement review-specific semantic guards and run tests.**

The validator must fail when:

- a mandatory Session Review section is missing;
- fewer than four positive or five negative review cases exist;
- exact-session, all-status, explicit-action, unresolved-Inbox, or no-timer requirements are absent;
- negative fixtures omit wrong-session, omitted-review, silent-mutation, or timer-inference coverage.

Run:

```bash
pnpm test -- tests/unit/scripts/validate-skill-assets.test.ts
```

Expected: PASS.

- [ ] **Step 7: Commit the review skill.**

```bash
git add skills/relay-session-review/SKILL.md skills/fixtures/session-review-positive.md skills/fixtures/session-review-negative.md scripts/validate-skill-assets.ts tests/unit/scripts/validate-skill-assets.test.ts
git commit -m "feat: add canonical Relay session review skill"
```

---

### Task 4: Enforce canonical-source boundaries and publish documentation

**Files:**

- Create: `docs/agent-skills.md`
- Modify: `scripts/validate-skill-assets.ts`
- Modify: `tests/unit/scripts/validate-skill-assets.test.ts`
- Modify: `README.md`
- Modify: `package.json` only if focused script wiring is required.

**Interfaces:**

- Consumes: canonical skills, contract docs, repository file tree.
- Produces: documented canonical source rules and deterministic rejection of vendor-owned policy sources.

- [ ] **Step 1: Add failing tests for canonical-source boundaries and documentation links.**

Create temporary vendor paths and verify policy duplication is rejected:

```ts
it('rejects vendor-specific canonical policy files', () => {
  const rootDir = createValidSkillFixtureRoot();
  mkdirSync(join(rootDir, 'integrations/codex/relay-capture'), { recursive: true });
  writeFileSync(
    join(rootDir, 'integrations/codex/relay-capture/SKILL.md'),
    '# independently modified policy\n',
  );

  expect(() => validateSkillAssets({ rootDir })).toThrow(/canonical|vendor-specific/i);
});
```

The rule should reject additional `SKILL.md` files under `integrations/`, `.claude/`, `.codex/`, or other vendor-specific roots when they contain Relay Capture/Session Review policy. Do not reject thin configuration/readme files that reference the canonical skills; #24 owns those wrappers.

Add repository validation coverage proving `README.md` links to `docs/agent-skills.md` and both canonical skill files.

- [ ] **Step 2: Run focused tests and verify failure.**

```bash
pnpm test -- tests/unit/scripts/validate-skill-assets.test.ts tests/unit/scripts/validate-repository-assets.test.ts
```

- [ ] **Step 3: Implement canonical-source boundary validation.**

Walk the repository while excluding `.git`, `node_modules`, `dist`, and `coverage`. Permit only these canonical Relay policy filenames:

```ts
const canonicalSkillFiles = new Set([
  'skills/relay-capture/SKILL.md',
  'skills/relay-session-review/SKILL.md',
]);
```

For any other `SKILL.md`, reject only when its normalized content identifies itself as `relay-capture`, `relay-session-review`, `Relay Capture`, or `Relay Session Review`. This avoids blocking unrelated future skills while preventing vendor policy forks.

- [ ] **Step 4: Write `docs/agent-skills.md`.**

Document:

- capabilities live in MCP/CLI; behaviour policy lives in canonical skills;
- exact canonical paths;
- MCP preference and CLI JSON fallback;
- same-database and same-contract guarantee;
- one-adapter-per-workflow rule;
- session ID ownership and exact-session review;
- fixture format and deterministic validation;
- vendor integrations must reference or mechanically copy canonical content and may not alter policy independently;
- live-LLM tests, vendor packaging, and setup workflows are intentionally deferred.

Link to:

- `../skills/relay-capture/SKILL.md`
- `../skills/relay-session-review/SKILL.md`
- `mcp-tools.md`
- `cli-reference.md`
- `session-semantics.md`

- [ ] **Step 5: Update `README.md`.**

Add a small `Agent skills` section that:

- links to `docs/agent-skills.md`;
- links directly to both canonical skills;
- states that these files guide agent behaviour and do not implement persistence or protocol handlers;
- does not include vendor installation instructions owned by #24/#25.

- [ ] **Step 6: Wire a focused script only if needed.**

Prefer keeping `validateRepositoryAssets()` as the single `verify` entry if it already runs during `pnpm verify`. Otherwise add:

```json
{
  "scripts": {
    "validate:skills": "tsx scripts/validate-skill-assets.ts",
    "verify": "... && pnpm validate:skills && ..."
  }
}
```

Do not duplicate execution if repository asset validation already invokes `validateSkillAssets`.

- [ ] **Step 7: Run documentation and asset validation tests.**

```bash
pnpm test -- tests/unit/scripts/validate-skill-assets.test.ts tests/unit/scripts/validate-repository-assets.test.ts
pnpm format:check
pnpm lint
pnpm typecheck
```

Expected: all PASS with no rewritten files.

- [ ] **Step 8: Commit canonical-source validation and docs.**

```bash
git add docs/agent-skills.md README.md scripts/validate-skill-assets.ts tests/unit/scripts/validate-skill-assets.test.ts tests/unit/scripts/validate-repository-assets.test.ts package.json
git commit -m "docs: publish canonical Relay skill guidance"
```

Omit `package.json` from `git add` when no script change was required.

---

### Task 5: Full verification and human policy review

**Files:**

- Modify only files required to fix failures found by verification.

**Interfaces:**

- Consumes: all issue #23 assets and existing repository quality gates.
- Produces: a reviewable implementation with deterministic automated evidence and explicit human policy checks.

- [ ] **Step 1: Run focused skill validation directly.**

```bash
pnpm test -- tests/unit/scripts/validate-skill-assets.test.ts tests/unit/scripts/validate-repository-assets.test.ts
```

Expected: PASS.

- [ ] **Step 2: Run the full non-mutating quality gate.**

```bash
pnpm verify
```

Expected: formatting check, lint, typecheck, tests, coverage, build, and repository asset validation all PASS with zero tracked-file rewrites.

- [ ] **Step 3: Inspect the working tree.**

```bash
git status --short
git diff --check
```

Expected: no unintended generated files, formatting rewrites, or whitespace errors.

- [ ] **Step 4: Perform the required human review gates.**

Read both skills as if following them as an agent and record the review in the PR description or issue update:

1. No sentence can reasonably grant autonomous edit, triage, start, complete, archive, or delete permission.
2. Source-context guidance is concrete, bounded, and privacy-preserving.
3. Review occurs before final completion and queries the exact active session ID.
4. Completed and archived captures remain visible when Relay returns them.
5. MCP/CLI selection is deterministic and CLI requires JSON mode.
6. No command flags, schemas, persistence rules, or lifecycle legality are duplicated from contract docs.
7. Fixtures contain no real secrets, credentials, personal data, or large source excerpts.

- [ ] **Step 5: Commit any verification fixes separately.**

```bash
git add <only-files-changed-by-verification-fixes>
git commit -m "fix: satisfy canonical skill policy gates"
```

Skip this commit when verification required no changes.

- [ ] **Step 6: Post implementation evidence to issue #23.**

Include:

- commit/PR link;
- exact canonical skill paths;
- focused test command and result;
- `pnpm verify` result;
- confirmation that the seven human review gates were completed;
- explicit statement that vendor integration and packaging remain deferred to #24/#25.

---

## Plan Self-Review

- **Spec coverage:** Task 1 establishes deterministic assets and removes the obsolete scaffold prohibition. Tasks 2 and 3 implement every Capture and Session Review policy plus positive/negative fixtures. Task 4 enforces one canonical source, documents MCP/CLI fallback, and updates repository links. Task 5 covers full verification and every required human review gate.
- **No placeholders:** Every file, section name, fixture shape, validation invariant, command, and commit boundary is explicit. Optional `package.json` modification is conditioned on the actual existing `verify` wiring rather than left as an implementation decision.
- **Type consistency:** The plan uses one validator entry point, `validateSkillAssets(options?: { rootDir?: string }): void`, and one fixture-case shape throughout. Capability names match `docs/mcp-tools.md`; CLI commands match `docs/cli-reference.md`.
- **Scope check:** The plan changes policy assets, deterministic validation, and documentation only. It excludes MCP/CLI implementation, persistence, lifecycle changes, vendor configuration, packaging, policy engines, and live-LLM CI as required.
