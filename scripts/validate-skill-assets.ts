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

export function validateSkillAssets(options: ValidateSkillAssetsOptions = {}): void {
  const rootDir = options.rootDir ? resolve(options.rootDir) : process.cwd();

  for (const path of [...canonicalSkillPaths, ...fixturePaths]) {
    if (!existsSync(join(rootDir, path))) {
      fail(`Required canonical skill asset missing: ${path}`);
    }
  }

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
