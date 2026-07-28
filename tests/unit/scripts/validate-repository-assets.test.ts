import { mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterEach, describe, expect, it } from 'vitest';
import { validateRepositoryAssets } from '../../../scripts/validate-repository-assets.js';

function createFixtureRoot(): string {
  const rootDir = mkdtempSync(join(tmpdir(), 'relay-asset-validator-'));

  const requiredDirs = [
    'src/application/health',
    'src/database',
    'src/interfaces/mcp',
    'src/interfaces/http',
    'src/interfaces/cli',
    'web/src',
    'skills/relay-capture',
    'skills/relay-session-review',
    'skills/fixtures',
  ];

  for (const dir of requiredDirs) {
    mkdirSync(join(rootDir, dir), { recursive: true });
  }

  writeFileSync(join(rootDir, '.nvmrc'), '24\n');
  writeFileSync(join(rootDir, '.editorconfig'), 'root = true\n');
  writeFileSync(join(rootDir, '.gitignore'), 'dist/\n');
  writeFileSync(join(rootDir, '.prettierrc.json'), '{}\n');
  writeFileSync(join(rootDir, 'eslint.config.js'), 'export default [];\n');
  writeFileSync(join(rootDir, 'tsconfig.base.json'), '{}\n');
  writeFileSync(
    join(rootDir, 'tsup.config.ts'),
    "export default { entry: { 'cli/main': 'src/interfaces/cli/main.ts' } };\n",
  );
  writeFileSync(
    join(rootDir, 'package.json'),
    JSON.stringify({
      name: 'relay',
      version: '0.1.0',
      bin: {
        relay: './dist/cli/main.js',
        'relay-mcp': './dist/mcp/main.js',
      },
    }),
  );
  writeFileSync(
    join(rootDir, 'README.md'),
    '# Relay\n\n[Decision](docs/decisions/0001-product-and-architecture.md)\n\n`node dist/cli/main.js`\n\n[Agent skills](docs/agent-skills.md)\n\n[Capture skill](skills/relay-capture/SKILL.md)\n\n[Review skill](skills/relay-session-review/SKILL.md)\n',
  );
  writeFileSync(join(rootDir, 'src/application/health/get-health.ts'), 'export {};\n');
  writeFileSync(join(rootDir, 'src/database/connection.ts'), 'export {};\n');
  writeFileSync(join(rootDir, 'src/interfaces/mcp/create-mcp-server.ts'), 'export {};\n');
  writeFileSync(join(rootDir, 'src/interfaces/http/create-http-server.ts'), 'export {};\n');
  writeFileSync(join(rootDir, 'src/interfaces/cli/main.ts'), 'export {};\n');
  writeFileSync(join(rootDir, 'src/interfaces/cli/run-cli.ts'), 'export {};\n');
  writeFileSync(join(rootDir, 'src/interfaces/cli/parse-cli.ts'), 'export {};\n');
  writeFileSync(join(rootDir, 'web/src/App.tsx'), 'export function App() { return null; }\n');
  mkdirSync(join(rootDir, 'docs/decisions'), { recursive: true });
  writeFileSync(join(rootDir, 'docs/decisions/0001-product-and-architecture.md'), '# decision\n');
  writeFileSync(
    join(rootDir, 'docs/decisions/0002-agent-integration-contracts.md'),
    '# decision\n',
  );
  writeFileSync(join(rootDir, 'docs/mcp-tools.md'), '# MCP tools\n');
  writeFileSync(
    join(rootDir, 'docs/cli-reference.md'),
    '# CLI reference\n\n`node dist/cli/main.js`\n',
  );
  writeFileSync(join(rootDir, 'docs/session-semantics.md'), '# Session semantics\n');
  writeFileSync(join(rootDir, 'docs/agent-skills.md'), '# Agent skills\n');
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
  for (const [index, filename] of [
    'capture-positive.md',
    'capture-negative.md',
    'session-review-positive.md',
    'session-review-negative.md',
  ].entries()) {
    const expected = filename.includes('positive') ? 'ACCEPT' : 'REJECT';
    const requiredIds = [
      ['CAPTURE-ACTIONABLE-001', 'CAPTURE-DUPLICATE-002', 'CAPTURE-CLI-FALLBACK-003'],
      [
        'CAPTURE-SENSITIVE-002',
        'CAPTURE-MUTATION-003',
        'CAPTURE-SESSION-005',
        'CAPTURE-ADAPTER-006',
      ],
      ['REVIEW-ACTIVE-SESSION-001', 'REVIEW-EXPLICIT-ACTIONS-002', 'REVIEW-UNRESOLVED-003'],
      [
        'REVIEW-OMITTED-001',
        'REVIEW-WRONG-SESSION-002',
        'REVIEW-SILENT-MUTATION-003',
        'REVIEW-TIMER-005',
        'REVIEW-SKIP-EMPTY-006',
        'REVIEW-GENERIC-MUTATION-007',
      ],
    ][index];
    if (!requiredIds) throw new Error(`Missing required fixture IDs for ${filename}`);
    writeFileSync(
      join(rootDir, 'skills/fixtures', filename),
      requiredIds
        .map(
          (id) =>
            `## ${id}\n\nExpected: ${expected}\n\n### Scenario\nScenario\n\n### Agent action\nAction\n\n### Reason\nReason\n`,
        )
        .join('\n'),
    );
  }
  mkdirSync(join(rootDir, 'src/interfaces/contracts'), { recursive: true });
  for (const filename of [
    'contract-version.ts',
    'error-contract.ts',
    'json-value-contract.ts',
    'session-contract.ts',
    'task-contract.ts',
    'warning-contract.ts',
  ]) {
    writeFileSync(join(rootDir, 'src/interfaces/contracts', filename), 'export {};\n');
  }
  mkdirSync(join(rootDir, 'tests/fixtures/contracts'), { recursive: true });
  for (const filename of [
    'capture-success.json',
    'capture-duplicate-warning.json',
    'validation-error.json',
    'not-found-error.json',
    'transition-conflict-error.json',
    'storage-error.json',
  ]) {
    writeFileSync(join(rootDir, 'tests/fixtures/contracts', filename), '{}\n');
  }
  mkdirSync(join(rootDir, 'dist/mcp'), { recursive: true });
  writeFileSync(join(rootDir, 'dist/mcp/main.js'), 'console.log("ok");\n');
  mkdirSync(join(rootDir, 'dist/cli'), { recursive: true });
  writeFileSync(join(rootDir, 'dist/cli/main.js'), 'console.log("ok");\n');

  return rootDir;
}

describe('validateRepositoryAssets', () => {
  const createdRoots: string[] = [];

  afterEach(() => {
    for (const rootDir of createdRoots) {
      rmSync(rootDir, { recursive: true, force: true });
    }
    createdRoots.splice(0, createdRoots.length);
  });

  it('rejects broken README local links', () => {
    const rootDir = createFixtureRoot();
    createdRoots.push(rootDir);

    writeFileSync(join(rootDir, 'README.md'), '# Relay\n\n[Missing](docs/missing.md)\n');

    expect(() => validateRepositoryAssets({ rootDir })).toThrow(/README/i);
  });

  it('rejects unresolved placeholder markers in committed source and docs', () => {
    const rootDir = createFixtureRoot();
    createdRoots.push(rootDir);

    writeFileSync(
      join(rootDir, 'src/interfaces/http/create-http-server.ts'),
      `// ${'TO' + 'DO'} fix me\n`,
    );

    expect(() => validateRepositoryAssets({ rootDir })).toThrow(new RegExp('TO' + 'DO', 'i'));
  });

  it('rejects unresolved placeholder markers in committed html assets', () => {
    const rootDir = createFixtureRoot();
    createdRoots.push(rootDir);

    writeFileSync(join(rootDir, 'web', 'index.html'), `<!-- ${'TO' + 'DO'} -->\n`);

    expect(() => validateRepositoryAssets({ rootDir })).toThrow(new RegExp('TO' + 'DO', 'i'));
  });

  it('requires the agent-integration contract documents and representative fixtures', () => {
    const rootDir = createFixtureRoot();
    createdRoots.push(rootDir);
    rmSync(join(rootDir, 'docs/mcp-tools.md'));

    expect(() => validateRepositoryAssets({ rootDir })).toThrow(/agent-integration|mcp-tools/i);
  });

  it('requires the source-checkout CLI entry and matching built bin', () => {
    const rootDir = createFixtureRoot();
    createdRoots.push(rootDir);
    rmSync(join(rootDir, 'dist/cli/main.js'));

    expect(() => validateRepositoryAssets({ rootDir })).toThrow(/CLI executable|dist\/cli/i);
  });

  it('accepts canonical skills but rejects legacy agent policy roots', () => {
    const rootDir = createFixtureRoot();
    createdRoots.push(rootDir);
    mkdirSync(join(rootDir, 'agent/skills'), { recursive: true });

    expect(() => validateRepositoryAssets({ rootDir })).toThrow(/legacy|agent\/skills/i);
  });

  it('requires README links to canonical skill guidance', () => {
    const rootDir = createFixtureRoot();
    createdRoots.push(rootDir);
    writeFileSync(join(rootDir, 'README.md'), '# Relay\n\n`node dist/cli/main.js`\n');

    expect(() => validateRepositoryAssets({ rootDir })).toThrow(/README.*agent-skills/i);
  });

  it('does not count plain text or fenced code mentions as README links', () => {
    const rootDir = createFixtureRoot();
    createdRoots.push(rootDir);
    writeFileSync(
      join(rootDir, 'README.md'),
      '# Relay\n\n`node dist/cli/main.js`\n\n```md\n[Agent skills](docs/agent-skills.md)\n[Capture skill](skills/relay-capture/SKILL.md)\n[Review skill](skills/relay-session-review/SKILL.md)\n```\n',
    );

    expect(() => validateRepositoryAssets({ rootDir })).toThrow(/README.*agent-skills/i);
  });

  it('accepts normalized Markdown links to canonical skill guidance', () => {
    const rootDir = createFixtureRoot();
    createdRoots.push(rootDir);
    writeFileSync(
      join(rootDir, 'README.md'),
      '# Relay\n\n`node dist/cli/main.js`\n\n[Agent skills](./docs/agent-skills.md#overview)\n[Capture skill](./skills/relay-capture/SKILL.md?source=readme)\n[Review skill](./skills/relay-session-review/SKILL.md)\n',
    );

    expect(() => validateRepositoryAssets({ rootDir })).not.toThrow();
  });
});
