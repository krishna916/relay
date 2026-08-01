import { cpSync, mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join } from 'node:path';
import { afterEach, describe, expect, it } from 'vitest';
import {
  requiredDistributionAssets,
  validateRepositoryAssets,
} from '../../../scripts/validate-repository-assets.js';

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
  cpSync(join(process.cwd(), 'tests/fixtures/agent-integrations/valid'), rootDir, {
    recursive: true,
  });
  writeFileSync(
    join(rootDir, 'skills/relay-capture/SKILL.md'),
    `## Purpose\n\nCapture a concrete, actionable follow-up.\n\n## When to capture\n\nUse it for a concrete, actionable follow-up.\n\n## Adapter selection\n\nMCP is preferred. CLI is the fallback with --output json and one adapter.\n\n## Session and provenance\n\nThe agent supplies createdByName and the exact active session ID. Relay supplies createdByType: AGENT and status: INBOX.\n\n## Capture procedure\n\nContinue the original work. An agent may autonomously create only a new Relay task in INBOX.\n\n## Duplicate handling\n\nA duplicate is advisory.\n\n## Context safety\n\nKeep context concise.\n\n## Autonomy boundaries\n\nAn agent must not edit, triage, start, complete, archive, delete, merge, or move any task. Leave captures in INBOX.\n\n## Do not capture\n\nDo not capture speculation.\n`,
  );
  writeFileSync(
    join(rootDir, 'skills/relay-session-review/SKILL.md'),
    `## Purpose\n\nReview before final completion.\n\n## When to review\n\nAlways perform the exact active session lookup before final completion.\n\n## Session lookup\n\nUse the exact active session ID. Include completed and archived captures; never mix sessions. An empty authoritative result is valid.\n\n## Review presentation\n\nPresent captures.\n\n## User-directed actions\n\nRequire explicit user direction and intent-specific actions.\n\n## Unresolved captures\n\nLeave unresolved tasks in INBOX.\n\n## Adapter selection\n\nUse the same adapter.\n\n## Prohibited behaviour\n\nNever infer completion from timer, inactivity, or process exit.\n`,
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

  cpSync(join(process.cwd(), 'package.json'), join(rootDir, 'package.json'));
  cpSync(
    join(process.cwd(), 'integrations/claude-desktop'),
    join(rootDir, 'integrations/claude-desktop'),
    { recursive: true },
  );
  for (const assetPath of requiredDistributionAssets) {
    const destination = join(rootDir, assetPath);
    mkdirSync(dirname(destination), { recursive: true });
    cpSync(join(process.cwd(), assetPath), destination);
  }

  return rootDir;
}

function updateJsonFixture(
  rootDir: string,
  relativePath: string,
  update: (fixture: Record<string, unknown>) => void,
): void {
  const filePath = join(rootDir, relativePath);
  const fixture = JSON.parse(readFileSync(filePath, 'utf8')) as Record<string, unknown>;
  update(fixture);
  writeFileSync(filePath, JSON.stringify(fixture));
}

function updateTextFixture(
  rootDir: string,
  relativePath: string,
  update: (content: string) => string,
): void {
  const filePath = join(rootDir, relativePath);
  writeFileSync(filePath, update(readFileSync(filePath, 'utf8')));
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

  it('rejects a missing integration asset through aggregate validation', () => {
    const rootDir = createFixtureRoot();
    createdRoots.push(rootDir);
    rmSync(join(rootDir, 'integrations/codex/config.toml.example'));

    expect(() => validateRepositoryAssets({ rootDir })).toThrow(/agent integration.*config\.toml/i);
  });

  it('rejects a missing distribution contract asset', () => {
    const rootDir = createFixtureRoot();
    createdRoots.push(rootDir);
    rmSync(join(rootDir, 'docs/distribution/release-policy.md'));

    expect(() => validateRepositoryAssets({ rootDir })).toThrow(/distribution.*release-policy/i);
  });

  it('requires the uniquely numbered distribution ADR', () => {
    const rootDir = createFixtureRoot();
    createdRoots.push(rootDir);
    rmSync(join(rootDir, 'docs/decisions/0003-distribution-filesystem-and-lifecycle.md'));

    expect(() => validateRepositoryAssets({ rootDir })).toThrow(
      /Required path missing: docs\/decisions\/0003-distribution-filesystem-and-lifecycle\.md/,
    );
  });

  it('accepts the complete distribution contract asset set', () => {
    const rootDir = createFixtureRoot();
    createdRoots.push(rootDir);

    expect(() => validateRepositoryAssets({ rootDir })).not.toThrow();
  });

  it('rejects drift in core distribution identifiers', () => {
    const mutations: readonly {
      readonly relativePath: string;
      readonly update: (fixture: Record<string, unknown>) => void;
      readonly error: RegExp;
    }[] = [
      {
        relativePath: 'package.json',
        update: (fixture) => {
          fixture.name = 'wrong-package';
        },
        error: /package\.json#name/i,
      },
      {
        relativePath: 'package.json',
        update: (fixture) => {
          fixture.engines = { node: '24' };
        },
        error: /engines\.node/i,
      },
      {
        relativePath: 'tests/fixtures/distribution/supported-platforms.json',
        update: (fixture) => {
          const supported = fixture.supported as Array<Record<string, unknown>>;
          supported[0]!.arch = 'arm64';
        },
        error: /supported tuples/i,
      },
      {
        relativePath: 'tests/fixtures/distribution/supported-platforms.json',
        update: (fixture) => {
          const unsupported = fixture.unsupported as Array<Record<string, unknown>>;
          unsupported[0]!.arch = 'x64';
        },
        error: /unsupported boundary/i,
      },
      {
        relativePath: 'tests/fixtures/distribution/path-resolution.json',
        update: (fixture) => {
          fixture.databaseEnvironmentOverrides = ['RELAY_HOME'];
        },
        error: /database environment override/i,
      },
      {
        relativePath: 'tests/fixtures/distribution/path-resolution.json',
        update: (fixture) => {
          fixture.rejectEmptyOrWhitespaceDatabaseOverride = false;
        },
        error: /empty or whitespace/i,
      },
      {
        relativePath: 'tests/fixtures/distribution/operational-commands.json',
        update: (fixture) => {
          fixture.commands = ['setup', 'mcp', 'ui', 'doctor', 'wrong'];
        },
        error: /operational commands/i,
      },
      {
        relativePath: 'tests/fixtures/distribution/lifecycle-policy.json',
        update: (fixture) => {
          fixture.downgradeSupported = true;
        },
        error: /downgrade support/i,
      },
      {
        relativePath: 'tests/fixtures/distribution/version-compatibility.json',
        update: (fixture) => {
          fixture.releaseTrigger = 'push';
        },
        error: /manual maintainer/i,
      },
    ];

    for (const mutation of mutations) {
      const rootDir = createFixtureRoot();
      createdRoots.push(rootDir);
      updateJsonFixture(rootDir, mutation.relativePath, mutation.update);

      expect(() => validateRepositoryAssets({ rootDir })).toThrow(mutation.error);
    }
  });

  it('rejects drift in native client ownership contracts', () => {
    const mutations: readonly {
      readonly relativePath: string;
      readonly update: (rootDir: string) => void;
      readonly error: RegExp;
    }[] = [
      {
        relativePath: 'tests/fixtures/distribution/config-examples/codex-after.toml',
        update: (rootDir) =>
          updateTextFixture(
            rootDir,
            'tests/fixtures/distribution/config-examples/codex-after.toml',
            (content) => content.replace('command = "relay"', 'command = "node"'),
          ),
        error: /Codex.*installed entry/i,
      },
      {
        relativePath: 'tests/fixtures/distribution/config-examples/claude-code-after.json',
        update: (rootDir) =>
          updateJsonFixture(
            rootDir,
            'tests/fixtures/distribution/config-examples/claude-code-after.json',
            (fixture) => {
              const mcpServers = fixture.mcpServers as Record<string, Record<string, unknown>>;
              const relay = mcpServers.relay;
              if (!relay) throw new Error('Missing Claude Code relay fixture entry');
              relay.env = { RELAY_DB_PATH: '/unexpected/relay.db' };
            },
          ),
        error: /Claude Code installed entry must contain only command and args/i,
      },
      {
        relativePath: 'tests/fixtures/distribution/client-config-ownership.json',
        update: (rootDir) =>
          updateJsonFixture(
            rootDir,
            'tests/fixtures/distribution/client-config-ownership.json',
            (fixture) => {
              fixture.configPathSelection = 'home-discovery';
            },
          ),
        error: /configPathSelection/i,
      },
      {
        relativePath: 'tests/fixtures/distribution/client-config-ownership.json',
        update: (rootDir) =>
          updateJsonFixture(
            rootDir,
            'tests/fixtures/distribution/client-config-ownership.json',
            (fixture) => {
              fixture.missingOrRelativePathExitCode = 3;
            },
          ),
        error: /missingOrRelativePathExitCode/i,
      },
      {
        relativePath: 'tests/fixtures/distribution/config-examples/codex-before.toml',
        update: (rootDir) => {
          rmSync(join(rootDir, 'tests/fixtures/distribution/config-examples/codex-before.toml'));
        },
        error: /codex-before\.toml/i,
      },
    ];

    for (const mutation of mutations) {
      const rootDir = createFixtureRoot();
      createdRoots.push(rootDir);
      mutation.update(rootDir);

      expect(() => validateRepositoryAssets({ rootDir })).toThrow(mutation.error);
    }
  });
});
