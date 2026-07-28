import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs';
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
  writeFileSync(join(rootDir, 'skills/relay-capture/SKILL.md'), '# Relay Capture\n');
  writeFileSync(join(rootDir, 'skills/relay-session-review/SKILL.md'), '# Relay Session Review\n');
  for (const [index, filename] of [
    'capture-positive.md',
    'capture-negative.md',
    'session-review-positive.md',
    'session-review-negative.md',
  ].entries()) {
    const expected = filename.includes('positive') ? 'ACCEPT' : 'REJECT';
    writeFileSync(
      join(rootDir, 'skills/fixtures', filename),
      `## CASE-${String(index + 1).padStart(3, '0')}\n\nExpected: ${expected}\n\n### Scenario\nScenario\n\n### Agent action\nAction\n\n### Reason\nReason\n`,
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
});
