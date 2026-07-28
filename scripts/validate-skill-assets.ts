import { existsSync, readFileSync, readdirSync } from 'node:fs';
import { join, relative, resolve } from 'node:path';

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

interface ForbiddenPolicyRule {
  readonly label: string;
  readonly pattern: RegExp;
  readonly skill: 'capture' | 'review';
}

export interface ValidateSkillAssetsOptions {
  readonly rootDir?: string;
}

function fail(message: string): never {
  throw new Error(`[SKILL ASSET VALIDATION FAILURE] ${message}`);
}

function requiredSection(caseContent: string, heading: string, fixturePath: string): string {
  const escapedHeading = heading.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  const match =
    new RegExp(`^### ${escapedHeading}\\r?\\n([\\s\\S]*?)(?=^### |^## )`, 'm').exec(caseContent) ??
    new RegExp(`^### ${escapedHeading}\\r?\\n([\\s\\S]*)$`, 'm').exec(caseContent);
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
      fail(
        `${fixturePath} case ${id} must contain exactly one Expected: ACCEPT or Expected: REJECT line.`,
      );
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

function validateFixtureCoverage(fixturePath: string, cases: readonly SkillFixtureCase[]): void {
  const required = fixturePath.endsWith('capture-positive.md')
    ? ['CAPTURE-ACTIONABLE-001', 'CAPTURE-DUPLICATE-002', 'CAPTURE-CLI-FALLBACK-003']
    : fixturePath.endsWith('capture-negative.md')
      ? [
          'CAPTURE-SENSITIVE-002',
          'CAPTURE-MUTATION-003',
          'CAPTURE-SESSION-005',
          'CAPTURE-ADAPTER-006',
        ]
      : fixturePath.endsWith('session-review-positive.md')
        ? ['REVIEW-ACTIVE-SESSION-001', 'REVIEW-EXPLICIT-ACTIONS-002', 'REVIEW-UNRESOLVED-003']
        : [
            'REVIEW-OMITTED-001',
            'REVIEW-WRONG-SESSION-002',
            'REVIEW-SILENT-MUTATION-003',
            'REVIEW-TIMER-005',
            'REVIEW-SKIP-EMPTY-006',
            'REVIEW-GENERIC-MUTATION-007',
          ];
  for (const id of required) {
    if (!cases.some((fixtureCase) => fixtureCase.id === id))
      fail(`${fixturePath} is missing required coverage: ${id}.`);
  }
}

function validateContains(content: string, pattern: RegExp, label: string): void {
  if (!pattern.test(content)) {
    fail(`Canonical skill is missing required policy: ${label}.`);
  }
}

const forbiddenPolicyRules: readonly ForbiddenPolicyRule[] = [
  {
    skill: 'capture',
    label: 'autonomous mutation of an existing task',
    pattern:
      /\b(?:may|can)\s+(?:silently\s+)?(?:autonomously\s+)?(?:edit|triage|move|start|complete|archive|delete|merge)\b/i,
  },
  {
    skill: 'capture',
    label: 'moving a new autonomous capture out of INBOX',
    pattern:
      /(?:may|can|should)\b[^.\n]*\b(?:autonomous|new)\b[^.\n]*\b(?:move|remove|take)\b[^.\n]*\b(?:out of|from)\s+INBOX\b/i,
  },
  {
    skill: 'capture',
    label: 'storing sensitive or oversized context',
    pattern:
      /\b(?:may|can|should)\s+(?:store|include|attach|copy)\b[^.\n]*\b(?:prompts?|transcripts?|source files?|secrets?|credentials?|tokens?|large stack traces?|logs?|oversized)\b/i,
  },
  {
    skill: 'capture',
    label: 'reusing a session ID across unrelated sessions',
    pattern: /\b(?:may|can|should)\b[^.\n]*\breuse\b[^.\n]*\bsession ID\b[^.\n]*\bunrelated\b/i,
  },
  {
    skill: 'capture',
    label: 'unjustified adapter switching',
    pattern:
      /\b(?:may|can|should)\b[^.\n]*\bswitch\b[^.\n]*\b(?:MCP|CLI)\b[^.\n]*\b(?:without|regardless of)\b[^.\n]*(?:failure|unavailable|reason|debug)/i,
  },
  {
    skill: 'capture',
    label: 'parsing decorative CLI output',
    pattern:
      /\b(?:may|can|should)\b[^.\n]*\bparse\b[^.\n]*\b(?:decorative|human|terminal)\b[^.\n]*(?:output|text)/i,
  },
  {
    skill: 'review',
    label: 'mutation without explicit user direction',
    pattern:
      /\b(?:may|can|should)\b[^.\n]*\b(?:mutate|change|update)\b[^.\n]*(?:without|no)\b[^.\n]*\buser direction\b/i,
  },
  {
    skill: 'review',
    label: 'generic status mutation',
    pattern:
      /\b(?:may|can|should)\b[^.\n]*\b(?:generic|unrestricted)\b[^.\n]*\bstatus\b[^.\n]*\b(?:mutation|update|change)\b/i,
  },
  {
    skill: 'review',
    label: 'skipping the exact-session lookup',
    pattern:
      /(?<!never )(?<!do not )(?<!must not )(?<!should not )(?<!don't )\b(?:skip|omit|may skip|can omit)\b[^.\n]*\b(?:exact[- ]session|session)\b[^.\n]*\b(?:lookup|review)\b/i,
  },
  {
    skill: 'review',
    label: 'guessed or different session ID',
    pattern: /\b(?:may|can|should)\b[^.\n]*\b(?:guess|different|another)\b[^.\n]*\bsession ID\b/i,
  },
  {
    skill: 'review',
    label: 'hiding completed or archived captures',
    pattern:
      /\b(?:may|can|should)\b[^.\n]*\b(?:hide|omit|exclude)\b[^.\n]*\b(?:completed|archived)\b/i,
  },
  {
    skill: 'review',
    label: 'completion inferred from process state',
    pattern:
      /\b(?:may|can|should)\b[^.\n]*\binfer\b[^.\n]*\bcompletion\b[^.\n]*\b(?:timer|inactivity|process exit)\b/i,
  },
];

function validateForbiddenPolicies(content: string, skill: ForbiddenPolicyRule['skill']): void {
  for (const rule of forbiddenPolicyRules) {
    if (rule.skill === skill && rule.pattern.test(content)) {
      fail(`Canonical skill contains forbidden policy: ${rule.label}.`);
    }
  }
}

function validateFrontmatter(content: string, expectedName: string): void {
  const match = /^---\r?\n([\s\S]*?)\r?\n---\r?\n/.exec(content);
  const frontmatter = match?.[1];
  if (!frontmatter) fail(`Canonical skill ${expectedName} requires parseable YAML frontmatter.`);
  const lines = frontmatter.split(/\r?\n/).filter(Boolean);
  if (lines.length !== 2 || !lines.every((line) => /^(name|description): .+/.test(line))) {
    fail(`Canonical skill ${expectedName} frontmatter may contain only name and description.`);
  }
  const values = Object.fromEntries(lines.map((line) => line.split(/: (.+)/, 2))) as Record<
    string,
    string
  >;
  if (values.name !== expectedName || !values.description?.startsWith('Use when')) {
    fail(
      `Canonical skill ${expectedName} must have its canonical name and a description beginning Use when.`,
    );
  }
}

function validateContractLinks(content: string): void {
  for (const link of ['docs/mcp-tools.md', 'docs/cli-reference.md', 'docs/session-semantics.md']) {
    if (!content.includes(link)) fail(`Canonical skill must link to ${link}.`);
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
    [/createdByName/i, 'caller-owned createdByName'],
    [/exact active session ID/i, 'exact active session ID'],
    [/createdByType/i, 'adapter-owned createdByType'],
    [/Relay.*(?:INBOX|status)|(?:INBOX|status).*Relay/i, 'Relay-owned capture status'],
    [/INBOX/i, 'INBOX capture'],
    [/duplicate.*advisory/i, 'advisory duplicate handling'],
    [/continue.*original work/i, 'continue original work'],
    [/must not.*(?:edit|triage|start|complete|archive)/i, 'autonomy boundary'],
  ] as const) {
    validateContains(content, pattern, label);
  }
  validateForbiddenPolicies(content, 'capture');
}

function validateReviewSkill(content: string): void {
  for (const section of [
    'Purpose',
    'When to review',
    'Session lookup',
    'Review presentation',
    'User-directed actions',
    'Unresolved captures',
    'Adapter selection',
    'Prohibited behaviour',
  ])
    validateContains(content, new RegExp(`^## ${section}$`, 'mi'), section);
  for (const [pattern, label] of [
    [
      /always.*exact active[- ]session.*before final completion/i,
      'unconditional pre-completion review',
    ],
    [/exact active session ID/i, 'exact session ID'],
    [/empty.*authoritative|authoritative.*empty/i, 'authoritative empty result'],
    [/completed.*archived|archived.*completed/i, 'all-status review'],
    [/explicit user direction/i, 'explicit user direction'],
    [/intent-specific/i, 'intent-specific actions'],
    [/unresolved.*INBOX/i, 'unresolved INBOX'],
    [/never infer.*(?:timer|inactivity|process exit)/i, 'no timer inference'],
    [/never.*(?:mix|another).*session/i, 'session isolation'],
  ] as const)
    validateContains(content, pattern, label);
  validateForbiddenPolicies(content, 'review');
}

function validateCanonicalSources(rootDir: string, currentDir = rootDir): void {
  for (const entry of readdirSync(currentDir, { withFileTypes: true })) {
    if (['.git', 'node_modules', 'dist', 'coverage'].includes(entry.name)) continue;
    const fullPath = join(currentDir, entry.name);
    if (entry.isDirectory()) {
      validateCanonicalSources(rootDir, fullPath);
      continue;
    }
    if (entry.name !== 'SKILL.md') continue;
    const path = relative(rootDir, fullPath).replaceAll('\\', '/');
    if (canonicalSkillPaths.includes(path as (typeof canonicalSkillPaths)[number])) continue;
    const content = readFileSync(fullPath, 'utf-8');
    const candidates = canonicalSkillPaths.filter((canonicalPath) => {
      const skillName = canonicalPath.includes('relay-capture')
        ? /relay-capture|Relay Capture/i
        : /relay-session-review|Relay Session Review/i;
      return skillName.test(content);
    });
    if (candidates.length === 0) continue;
    if (candidates.length > 1) {
      fail(`Vendor-specific Relay policy must identify one canonical source: ${path}.`);
    }
    const canonical = candidates[0];
    if (!canonical) {
      fail(`Vendor-specific Relay policy must identify a canonical source: ${path}.`);
    }
    const canonicalName = canonical.includes('relay-capture')
      ? 'relay-capture'
      : 'relay-session-review';
    const sourcePattern = new RegExp(
      `${canonicalName}/SKILL\\.md|${canonical.replace(/[.*+?^${}()|[\\]\\]/g, '\\$&')}`,
      'i',
    );
    if (!sourcePattern.test(content)) {
      fail(`Vendor-specific Relay policy must explicitly reference its canonical source: ${path}.`);
    }
  }
}

export function validateSkillAssets(options: ValidateSkillAssetsOptions = {}): void {
  const rootDir = options.rootDir ? resolve(options.rootDir) : process.cwd();

  for (const path of [...canonicalSkillPaths, ...fixturePaths]) {
    if (!existsSync(join(rootDir, path))) {
      fail(`Required canonical skill asset missing: ${path}`);
    }
  }

  const capture = readFileSync(join(rootDir, canonicalSkillPaths[0]), 'utf-8');
  const review = readFileSync(join(rootDir, canonicalSkillPaths[1]), 'utf-8');
  validateFrontmatter(capture, 'relay-capture');
  validateFrontmatter(review, 'relay-session-review');
  validateContractLinks(capture);
  validateContractLinks(review);
  validateCaptureSkill(capture);
  validateReviewSkill(review);
  validateCanonicalSources(rootDir);

  const seenIds = new Set<string>();
  for (const fixturePath of fixturePaths) {
    const cases = parseFixtureCases(fixturePath, readFileSync(join(rootDir, fixturePath), 'utf-8'));
    validateFixtureCoverage(fixturePath, cases);
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
