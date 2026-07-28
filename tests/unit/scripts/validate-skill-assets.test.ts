import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs';
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

  for (const path of [
    'skills/relay-capture',
    'skills/relay-session-review',
    'skills/fixtures',
  ]) {
    mkdirSync(join(rootDir, path), { recursive: true });
  }

  writeFileSync(
    join(rootDir, 'skills/relay-capture/SKILL.md'),
    `## Purpose\n\nCapture a concrete, actionable follow-up.\n\n## When to capture\n\nUse it for a concrete, actionable follow-up.\n\n## Adapter selection\n\nMCP is preferred. CLI is the fallback with --output json and one adapter.\n\n## Session and provenance\n\nUse the exact session ID.\n\n## Capture procedure\n\nContinue the original work.\n\n## Duplicate handling\n\nA duplicate is advisory.\n\n## Context safety\n\nKeep context concise.\n\n## Autonomy boundaries\n\nAn agent must not edit, triage, start, complete, or archive tasks. Leave captures in INBOX.\n\n## Do not capture\n\nDo not capture speculation.\n`,
  );
  writeFileSync(join(rootDir, 'skills/relay-session-review/SKILL.md'), '# Relay Session Review\n');
  for (const [index, path] of fixtureFiles.entries()) {
    writeFileSync(
      join(rootDir, path),
      fixtureCase(
        `CASE-${String(index + 1).padStart(3, '0')}`,
        path.includes('positive') ? 'ACCEPT' : 'REJECT',
      ),
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

    expect(() => validateSkillAssets({ rootDir })).toThrow(/Purpose|When to capture|MCP|INBOX/i);
  });
});
