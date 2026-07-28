import { mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterEach, describe, expect, it } from 'vitest';
import { validateSkillAssets } from '../../../scripts/validate-skill-assets.js';

const fixtureFiles = [
  'skills/fixtures/capture-positive.md',
  'skills/fixtures/capture-negative.md',
  'skills/fixtures/session-review-positive.md',
  'skills/fixtures/session-review-negative.md',
] as const;

function fixtureCase(id: string, expected: 'ACCEPT' | 'REJECT'): string {
  return `## ${id}\n\nExpected: ${expected}\n\n### Scenario\nA concrete scenario.\n\n### Agent action\nA bounded agent action.\n\n### Reason\nA deterministic policy reason.\n`;
}

function createValidSkillFixtureRoot(): string {
  const rootDir = mkdtempSync(join(tmpdir(), 'relay-skill-validator-'));

  for (const path of ['skills/relay-capture', 'skills/relay-session-review', 'skills/fixtures']) {
    mkdirSync(join(rootDir, path), { recursive: true });
  }

  writeFileSync(
    join(rootDir, 'skills/relay-capture/SKILL.md'),
    `## Purpose\n\nCapture a concrete, actionable follow-up.\n\n## When to capture\n\nUse it for a concrete, actionable follow-up.\n\n## Adapter selection\n\nMCP is preferred. CLI is the fallback with --output json and one adapter.\n\n## Session and provenance\n\nThe agent supplies createdByName and the exact active session ID. Relay supplies createdByType: AGENT and status: INBOX.\n\n## Capture procedure\n\nContinue the original work.\n\n## Duplicate handling\n\nA duplicate is advisory.\n\n## Context safety\n\nKeep context concise.\n\n## Autonomy boundaries\n\nAn agent must not edit, triage, start, complete, or archive tasks. Leave captures in INBOX.\n\n## Do not capture\n\nDo not capture speculation.\n`,
  );
  writeFileSync(
    join(rootDir, 'skills/relay-session-review/SKILL.md'),
    `## Purpose\n\nReview before final completion.\n\n## When to review\n\nAlways perform the exact active session lookup before final completion.\n\n## Session lookup\n\nUse the exact active session ID. Include completed and archived tasks; never mix sessions. An empty authoritative result is valid.\n\n## Review presentation\n\nPresent captures.\n\n## User-directed actions\n\nRequire explicit user direction and intent-specific actions.\n\n## Unresolved captures\n\nLeave unresolved tasks in INBOX.\n\n## Adapter selection\n\nUse the same adapter.\n\n## Prohibited behaviour\n\nNever infer completion from timer, inactivity, or process exit.\n`,
  );
  for (const [path, name, description] of [
    ['skills/relay-capture/SKILL.md', 'relay-capture', 'Use when testing capture.'],
    ['skills/relay-session-review/SKILL.md', 'relay-session-review', 'Use when testing review.'],
  ] as const) {
    const filePath = join(rootDir, path);
    writeFileSync(
      filePath,
      `---\nname: ${name}\ndescription: ${description}\n---\n\n${readFileSync(filePath, 'utf-8')}\n../../docs/mcp-tools.md ../../docs/cli-reference.md ../../docs/session-semantics.md\n`,
    );
  }
  const requiredFixtureIds = [
    ['CAPTURE-ACTIONABLE-001', 'CAPTURE-DUPLICATE-002', 'CAPTURE-CLI-FALLBACK-003'],
    ['CAPTURE-SENSITIVE-002', 'CAPTURE-MUTATION-003', 'CAPTURE-SESSION-005', 'CAPTURE-ADAPTER-006'],
    ['REVIEW-ACTIVE-SESSION-001', 'REVIEW-EXPLICIT-ACTIONS-002', 'REVIEW-UNRESOLVED-003'],
    [
      'REVIEW-OMITTED-001',
      'REVIEW-WRONG-SESSION-002',
      'REVIEW-SILENT-MUTATION-003',
      'REVIEW-TIMER-005',
      'REVIEW-SKIP-EMPTY-006',
      'REVIEW-GENERIC-MUTATION-007',
    ],
  ] as const;
  for (const [index, path] of fixtureFiles.entries()) {
    const ids = requiredFixtureIds[index];
    if (!ids) throw new Error(`Missing required fixture IDs for ${path}`);
    writeFileSync(
      join(rootDir, path),
      ids.map((id) => fixtureCase(id, path.includes('positive') ? 'ACCEPT' : 'REJECT')).join('\n'),
    );
  }

  return rootDir;
}

describe('validateSkillAssets', () => {
  const createdRoots: string[] = [];

  afterEach(() => {
    for (const rootDir of createdRoots) {
      rmSync(rootDir, { recursive: true, force: true });
    }
    createdRoots.splice(0, createdRoots.length);
  });

  it('requires both canonical skill files and four fixture files', () => {
    const rootDir = createValidSkillFixtureRoot();
    createdRoots.push(rootDir);
    rmSync(join(rootDir, 'skills/relay-capture/SKILL.md'));

    expect(() => validateSkillAssets({ rootDir })).toThrow(/relay-capture\/SKILL\.md/i);
  });

  it('rejects malformed fixture cases', () => {
    const rootDir = createValidSkillFixtureRoot();
    createdRoots.push(rootDir);
    writeFileSync(
      join(rootDir, 'skills/fixtures/capture-positive.md'),
      '## CAPTURE-BROKEN-001\n\nExpected: ACCEPT\n',
    );

    expect(() => validateSkillAssets({ rootDir })).toThrow(/Scenario|Agent action|Reason/i);
  });

  it('requires the Capture policy sections and invariants', () => {
    const rootDir = createValidSkillFixtureRoot();
    createdRoots.push(rootDir);
    writeFileSync(join(rootDir, 'skills/relay-capture/SKILL.md'), '# Relay Capture\n');

    expect(() => validateSkillAssets({ rootDir })).toThrow(
      /frontmatter|Purpose|When to capture|MCP|INBOX/i,
    );
  });

  it('rejects vendor-specific canonical policy files', () => {
    const rootDir = createValidSkillFixtureRoot();
    createdRoots.push(rootDir);
    mkdirSync(join(rootDir, 'integrations/codex/relay-capture'), { recursive: true });
    writeFileSync(join(rootDir, 'integrations/codex/relay-capture/SKILL.md'), '# Relay Capture\n');

    expect(() => validateSkillAssets({ rootDir })).toThrow(/canonical|vendor-specific/i);
  });

  it('accepts vendor skills that explicitly reference either canonical policy source', () => {
    const rootDir = createValidSkillFixtureRoot();
    createdRoots.push(rootDir);
    mkdirSync(join(rootDir, 'integrations/codex/relay-capture'), { recursive: true });
    mkdirSync(join(rootDir, 'integrations/codex/relay-session-review'), { recursive: true });
    writeFileSync(
      join(rootDir, 'integrations/codex/relay-capture/SKILL.md'),
      '# Relay Capture\n\nSee [canonical source](../../../../skills/relay-capture/SKILL.md).\n',
    );
    writeFileSync(
      join(rootDir, 'integrations/codex/relay-session-review/SKILL.md'),
      '# Relay Session Review\n\nSee [canonical source](../../../../skills/relay-session-review/SKILL.md).\n',
    );

    expect(() => validateSkillAssets({ rootDir })).not.toThrow();
  });

  it('requires caller-owned capture provenance and Relay-owned fields', () => {
    const rootDir = createValidSkillFixtureRoot();
    createdRoots.push(rootDir);
    const skillPath = join(rootDir, 'skills/relay-capture/SKILL.md');
    writeFileSync(
      skillPath,
      readFileSync(skillPath, 'utf-8').replace(
        /The agent supplies createdByName and the exact active session ID\. Relay supplies createdByType: AGENT and status: INBOX\./,
        'Provide provenance for the capture.',
      ),
    );

    expect(() => validateSkillAssets({ rootDir })).toThrow(
      /createdByName|session ID|createdByType|INBOX|status/i,
    );
  });

  it('requires session review before completion even when the result is empty', () => {
    const rootDir = createValidSkillFixtureRoot();
    createdRoots.push(rootDir);
    const skillPath = join(rootDir, 'skills/relay-session-review/SKILL.md');
    writeFileSync(
      skillPath,
      readFileSync(skillPath, 'utf-8').replace(
        'Always perform the exact active session lookup before final completion.',
        'Review before final completion when captures may exist.',
      ),
    );

    expect(() => validateSkillAssets({ rootDir })).toThrow(
      /conditional|final completion|session lookup/i,
    );
  });

  it('rejects valid-looking fixtures that omit required issue coverage', () => {
    const rootDir = createValidSkillFixtureRoot();
    createdRoots.push(rootDir);
    writeFileSync(
      join(rootDir, 'skills/fixtures/capture-positive.md'),
      fixtureCase('CASE-001', 'ACCEPT'),
    );

    expect(() => validateSkillAssets({ rootDir })).toThrow(
      /required coverage|CAPTURE-ACTIONABLE-001/i,
    );
  });

  it.each([
    ['capture', 'An agent may autonomously archive low-priority tasks.', /forbidden|archive/i],
    [
      'review',
      'Skip the exact session lookup when the agent believes there are no captures.',
      /forbidden|lookup|skip/i,
    ],
    [
      'capture',
      'The agent may parse decorative CLI output instead of JSON.',
      /forbidden|decorative|JSON/i,
    ],
    [
      'capture',
      'The agent may store full source files and secrets as context.',
      /forbidden|source|secret/i,
    ],
  ])('rejects contradictory unsafe %s policy: %s', (skill, unsafePolicy, errorPattern) => {
    const rootDir = createValidSkillFixtureRoot();
    createdRoots.push(rootDir);
    const skillPath = join(
      rootDir,
      skill === 'capture'
        ? 'skills/relay-capture/SKILL.md'
        : 'skills/relay-session-review/SKILL.md',
    );
    writeFileSync(skillPath, `${readFileSync(skillPath, 'utf-8')}\n${unsafePolicy}\n`);

    expect(() => validateSkillAssets({ rootDir })).toThrow(errorPattern);
  });

  it('allows canonical prohibition wording without treating it as permission', () => {
    const rootDir = createValidSkillFixtureRoot();
    createdRoots.push(rootDir);
    expect(() => validateSkillAssets({ rootDir })).not.toThrow();
  });

  it.each([
    'Do not skip the exact session lookup before final completion.',
    'The agent must not omit the exact session lookup before final completion.',
  ])('allows exact-session prohibitions: %s', (prohibition) => {
    const rootDir = createValidSkillFixtureRoot();
    createdRoots.push(rootDir);
    const skillPath = join(rootDir, 'skills/relay-session-review/SKILL.md');
    writeFileSync(skillPath, `${readFileSync(skillPath, 'utf-8')}\n${prohibition}\n`);

    expect(() => validateSkillAssets({ rootDir })).not.toThrow();
  });
});
