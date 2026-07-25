import { existsSync, readFileSync } from 'node:fs';
import { join } from 'node:path';

function fail(msg: string): never {
  process.stderr.write(`[ASSET VALIDATION FAILURE] ${msg}\n`);
  process.exit(1);
}

function validateAssets(): void {
  const cwd = process.cwd();

  // 1. Required files/directories
  const requiredPaths = [
    '.nvmrc',
    '.editorconfig',
    '.gitignore',
    '.prettierrc.json',
    'eslint.config.js',
    'package.json',
    'README.md',
    'tsconfig.base.json',
    'src/application/health/get-health.ts',
    'src/database/connection.ts',
    'src/interfaces/mcp/create-mcp-server.ts',
    'src/interfaces/http/create-http-server.ts',
    'web/src/App.tsx',
  ];

  for (const p of requiredPaths) {
    if (!existsSync(join(cwd, p))) {
      fail(`Required path missing: ${p}`);
    }
  }

  // 2. package.json bin validation
  const pkg = JSON.parse(readFileSync(join(cwd, 'package.json'), 'utf-8')) as {
    bin?: Record<string, string>;
  };
  const binRelayMcp = pkg.bin?.['relay-mcp'];
  if (binRelayMcp !== './dist/mcp/main.js') {
    fail(`package.json#bin.relay-mcp must point to ./dist/mcp/main.js (got ${String(binRelayMcp)})`);
  }

  // 3. Built MCP file existence after build
  if (!existsSync(join(cwd, 'dist', 'mcp', 'main.js'))) {
    fail('Built MCP executable missing at dist/mcp/main.js. Run pnpm build first.');
  }

  // 4. No SKILL.md or agent configs in #1
  const forbidden = ['SKILL.md', 'agent/skills', 'agent/mcp'];
  for (const f of forbidden) {
    if (existsSync(join(cwd, f))) {
      fail(`Forbidden asset for Issue #1 present: ${f}`);
    }
  }

  process.stdout.write('Repository asset validation passed successfully.\n');
}

validateAssets();
