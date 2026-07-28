# PR #32 Review Remediation Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** Address all eight actionable remediation tasks from PR #32 while preserving issue #23 scope and strengthening deterministic skill-asset validation.

**Architecture:** Keep policy in the two canonical skill files, examples in the four fixture files, and enforcement in `scripts/validate-skill-assets.ts`. Add focused validator tests that use canonical required fixture IDs and narrow affirmative-permission regex rules; update docs only where policy wording changed.

**Tech Stack:** TypeScript, Vitest, pnpm, Markdown policy assets, Prettier, ESLint, TypeScript build.

## Global Constraints

- Remain within issue #23 scope: canonical skills, deterministic fixtures, validators/tests, supporting docs, and verification.
- Do not add MCP/CLI implementation, lifecycle logic, vendor packaging, marketplace work, live-LLM tests, or a policy engine.
- Do not weaken coverage or quality gates.
- Do not add CI-only bypasses, ignored warnings, or content-based test-mode escapes.
- Do not post GitHub comments, resolve threads, push, or create a PR in this session.

---

### Task 1: Capture provenance wording

**Files:**

- Modify: `skills/relay-capture/SKILL.md`
- Test: `tests/unit/scripts/validate-skill-assets.test.ts`

- [ ] Add a failing regression test that removes caller-owned provenance guidance and expects validation to fail.
- [ ] Run the focused test and confirm failure is caused by missing `createdByName`, exact active `sessionId`, adapter-owned `createdByType`, and Relay-owned `INBOX)/status concepts.
- [ ] Replace the ambiguous Capture procedure wording with precise caller-owned and adapter-owned guidance linked to `docs/mcp-tools.md`.
- [ ] Run the focused test and confirm it passes.

### Task 2: Unconditional session review

**Files:**

- Modify: `skills/relay-session-review/SKILL.md`
- Modify: `skills/fixtures/session-review-negative.md`
- Test: `tests/unit/scripts/validate-skill-assets.test.ts`

- [ ] Add a failing regression test for conditional pre-completion lookup wording.
- [ ] Add `REVIEW-SKIP-EMPTY-006` as a deterministic negative fixture without removing existing IDs.
- [ ] Rewrite Prohibited behaviour to require exact-session lookup before final completion, including when the result is empty.
- [ ] Add validator assertions for unconditional lookup and empty-result authority.
- [ ] Run focused tests and confirm they pass.

### Task 3: Required fixture coverage

**Files:**

- Modify: `scripts/validate-skill-assets.ts`
- Modify: `tests/unit/scripts/validate-skill-assets.test.ts`

- [ ] Add a failing test with syntactically valid `CASE-*` entries and no canonical required IDs.
- [ ] Remove the `CASE-*` early return from `validateFixtureCoverage`.
- [ ] Update the temporary-root helper to generate every required issue-specific ID for the matching fixture file.
- [ ] Add a positive test proving the minimum canonical set passes.
- [ ] Run focused tests and confirm both negative and positive cases pass.

### Task 4: Forbidden-policy guardrails

**Files:**

- Modify: `scripts/validate-skill-assets.ts`
- Test: `tests/unit/scripts/validate-skill-assets.test.ts`

- [ ] Add table-driven failing tests for affirmative autonomous archive, conditional empty-review skip, decorative CLI parsing, and storing full source/secrets despite safe wording.
- [ ] Add a small `ForbiddenPolicyRule` structure and `validateForbiddenPolicies` function with inspectable regex, label, and skill applicability.
- [ ] Apply capture and review rules only to their relevant canonical skill.
- [ ] Ensure prohibition wording such as “Never archive autonomously” remains valid.
- [ ] Run focused tests and confirm contradiction cases fail for the unsafe sentence while positive controls pass.

### Task 5: Fixture coverage

**Files:**

- Modify: `skills/fixtures/capture-positive.md`
- Modify: `skills/fixtures/capture-negative.md`
- Modify: `skills/fixtures/session-review-positive.md`
- Modify: `skills/fixtures/session-review-negative.md`

- [ ] Compare all four files against issue #23’s required positive and negative behaviors.
- [ ] Add only concise deterministic cases needed for missing coverage, including skipped empty review.
- [ ] Run the validator tests and confirm all fixture IDs and expected outcomes are valid.

### Task 6: Policy-aligned documentation

**Files:**

- Modify: `docs/agent-skills.md`
- Modify: `README.md` only if a policy statement is inconsistent.

- [ ] Update documentation to state MCP preference, CLI JSON fallback, adapter consistency, caller-supplied name/session, Relay-owned provenance/status, unconditional exact-session review, and authoritative empty results.
- [ ] Keep detailed schemas and lifecycle rules in the canonical skills/contracts instead of duplicating them.
- [ ] Run formatting and asset validation checks.

### Task 7: Verification failure

**Files:**

- Modify only files justified by the failing verification and preceding tasks.

- [ ] Re-run the individual verification commands in package.json order after the changes.
- [ ] Identify the deterministic cause of the current `validate:assets` failure and fix the underlying parser/asset issue.
- [ ] Run `pnpm verify` from the repository checkout.
- [ ] Confirm no tracked files are mutated by verification and no quality gate is weakened.

### Task 8: Final self-review

**Files:**

- Review all changed canonical skills, fixtures, validator/tests, and docs.

- [ ] Read both canonical skills for provenance, unconditional review, privacy, adapter selection, and scope compliance.
- [ ] Confirm no vendor-specific canonical policy source or duplicated schema was introduced.
- [ ] Confirm all eight local task items are satisfied.
- [ ] Run fresh full verification and report exact evidence.
