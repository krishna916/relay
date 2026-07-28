import { existsSync, readFileSync } from 'node:fs';
import { join, resolve } from 'node:path';

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

interface SkillFixtureCase {
  readonly id: string;
  readonly expected: 'ACCEPT' | 'REJECT';
  readonly scenario: string;
  readonly agentAction: string;
  readonly reason: string;
}

export interface ValidateSkillAssetsOptions {
  readonly rootDir?: string;
}

function fail(message: string): never {
  throw new Error(`[SKILL ASSET VALIDATION FAILURE] ${message}`);
}

function requiredSection(caseContent: string, heading: string, fixturePath: string): string {
  const escapedHeading = heading.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  const match = new RegExp(
    `^### ${escapedHeading}\\r?\\n([\\s\\S]*?)(?=^### |^## |\\s*$)`,
    'm',
  ).exec(caseContent);
  const value = match?.[1]?.trim();
  if (!value) {
    fail(`${fixturePath} case is missing a non-empty ${heading} section.`);
  }
  return value;
}

function parseFixtureCases(fixturePath: string, content: string): readonly SkillFixtureCase[] {
  const headings = [...content.matchAll(/^## ([^\r\n#]+)\r?$/gm)];
  if (headings.length === 0) {
    fail(`${fixturePath} contains zero fixture cases.`);
  }

  return headings.map((heading, index) => {
    const id = heading[1]?.trim();
    if (!id) {
      fail(`${fixturePath} contains a fixture case without an ID.`);
    }
    const start = (heading.index ?? 0) + heading[0].length;
    const end = headings[index + 1]?.index ?? content.length;
    const caseContent = content.slice(start, end);
    const expectedMatches = [...caseContent.matchAll(/^Expected: (ACCEPT|REJECT)\r?$/gm)];
    if (expectedMatches.length !== 1 || !expectedMatches[0]?.[1]) {
      fail(`${fixturePath} case ${id} must contain exactly one Expected: ACCEPT or Expected: REJECT line.`);
    }

    return {
      id,
      expected: expectedMatches[0][1] as 'ACCEPT' | 'REJECT',
      scenario: requiredSection(caseContent, 'Scenario', fixturePath),
      agentAction: requiredSection(caseContent, 'Agent action', fixturePath),
      reason: requiredSection(caseContent, 'Reason', fixturePath),
    };
  });
}

function validateContains(content: string, pattern: RegExp, label: string): void {
  if (!pattern.test(content)) {
    fail(`Canonical skill is missing required policy: ${label}.`);
  }
}

function validateCaptureSkill(content: string): void {
  for (const section of [
    'Purpose',
    'When to capture',
    'Adapter selection',
    'Session and provenance',
    'Capture procedure',
    'Duplicate handling',
    'Context safety',
    'Autonomy boundaries',
    'Do not capture',
  ]) {
    validateContains(content, new RegExp(`^## ${section}$`, 'mi'), section);
  }
  for (const [pattern, label] of [
    [/concrete,? actionable follow-up/i, 'concrete actionable follow-up'],
    [/MCP.*preferred/i, 'MCP preference'],
    [/CLI.*fallback/i, 'CLI fallback'],
    [/--output json/i, 'CLI JSON output'],
    [/same adapter|one adapter/i, 'one adapter per workflow'],
    [/session ID/i, 'session ID'],
    [/INBOX/i, 'INBOX capture'],
    [/duplicate.*advisory/i, 'advisory duplicate handling'],
    [/continue.*original work/i, 'continue original work'],
    [/must not.*(?:edit|triage|start|complete|archive)/i, 'autonomy boundary'],
  ] as const) {
    validateContains(content, pattern, label);
  }
}

function validateReviewSkill(content: string): void {
  for (const section of [
    'Purpose', 'When to review', 'Session lookup', 'Review presentation',
    'User-directed actions', 'Unresolved captures', 'Adapter selection', 'Prohibited behaviour',
  ]) validateContains(content, new RegExp(`^## ${section}$`, 'mi'), section);
  for (const [pattern, label] of [
    [/before final completion/i, 'pre-completion review'], [/exact active session ID/i, 'exact session ID'],
    [/completed.*archived|archived.*completed/i, 'all-status review'], [/explicit user direction/i, 'explicit user direction'],
    [/intent-specific/i, 'intent-specific actions'], [/unresolved.*INBOX/i, 'unresolved INBOX'],
    [/never infer.*(?:timer|inactivity|process exit)/i, 'no timer inference'], [/never mix.*session/i, 'session isolation'],
  ] as const) validateContains(content, pattern, label);
}

export function validateSkillAssets(options: ValidateSkillAssetsOptions = {}): void {
  const rootDir = options.rootDir ? resolve(options.rootDir) : process.cwd();

  for (const path of [...canonicalSkillPaths, ...fixturePaths]) {
    if (!existsSync(join(rootDir, path))) {
      fail(`Required canonical skill asset missing: ${path}`);
    }
  }

  validateCaptureSkill(readFileSync(join(rootDir, canonicalSkillPaths[0]), 'utf-8'));
  validateReviewSkill(readFileSync(join(rootDir, canonicalSkillPaths[1]), 'utf-8'));

  const seenIds = new Set<string>();
  for (const fixturePath of fixturePaths) {
    const cases = parseFixtureCases(fixturePath, readFileSync(join(rootDir, fixturePath), 'utf-8'));
    const expected = fixturePath.endsWith('-positive.md') ? 'ACCEPT' : 'REJECT';
    for (const fixtureCase of cases) {
      if (fixtureCase.expected !== expected) {
        fail(`${fixturePath} case ${fixtureCase.id} must be ${expected}.`);
      }
      if (seenIds.has(fixtureCase.id)) {
        fail(`Duplicate fixture case ID: ${fixtureCase.id}.`);
      }
      seenIds.add(fixtureCase.id);
    }
  }
}
