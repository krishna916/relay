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
    'web/src',
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
    join(rootDir, 'package.json'),
    JSON.stringify({
      name: 'relay',
      version: '0.1.0',
      bin: {
        'relay-mcp': './dist/mcp/main.js',
      },
    }),
  );
  writeFileSync(
    join(rootDir, 'README.md'),
    '# Relay\n\n[Decision](docs/decisions/0001-product-and-architecture.md)\n',
  );
  writeFileSync(join(rootDir, 'src/application/health/get-health.ts'), 'export {};\n');
  writeFileSync(join(rootDir, 'src/database/connection.ts'), 'export {};\n');
  writeFileSync(join(rootDir, 'src/interfaces/mcp/create-mcp-server.ts'), 'export {};\n');
  writeFileSync(join(rootDir, 'src/interfaces/http/create-http-server.ts'), 'export {};\n');
  writeFileSync(join(rootDir, 'web/src/App.tsx'), 'export function App() { return null; }\n');
  mkdirSync(join(rootDir, 'docs/decisions'), { recursive: true });
  writeFileSync(join(rootDir, 'docs/decisions/0001-product-and-architecture.md'), '# decision\n');
  mkdirSync(join(rootDir, 'dist/mcp'), { recursive: true });
  writeFileSync(join(rootDir, 'dist/mcp/main.js'), 'console.log("ok");\n');

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
});
