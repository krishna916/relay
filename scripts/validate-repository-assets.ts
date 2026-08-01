import { existsSync, readFileSync, readdirSync } from 'node:fs';
import { isAbsolute, join, relative, resolve } from 'node:path';
import { pathToFileURL } from 'node:url';
import { validateSkillAssets } from './validate-skill-assets.js';
import { validateAgentIntegrationAssets } from './validate-agent-integration-assets.js';
import { validateMcpbAssets } from './validate-mcpb-assets.js';

function fail(msg: string): never {
  throw new Error(`[ASSET VALIDATION FAILURE] ${msg}`);
}

export interface ValidateRepositoryAssetsOptions {
  readonly rootDir?: string;
}

const requiredDistributionAssets = [
  'docs/decisions/0002-distribution-filesystem-and-lifecycle.md',
  'docs/distribution/operational-cli-contract.md',
  'docs/distribution/filesystem-contract.md',
  'docs/distribution/supported-platforms.md',
  'docs/distribution/setup-and-config-ownership.md',
  'docs/distribution/upgrade-removal-and-retention.md',
  'docs/distribution/version-compatibility.md',
  'docs/distribution/release-policy.md',
  'tests/fixtures/distribution/supported-platforms.json',
  'tests/fixtures/distribution/path-resolution.json',
  'tests/fixtures/distribution/operational-commands.json',
  'tests/fixtures/distribution/client-config-ownership.json',
  'tests/fixtures/distribution/lifecycle-policy.json',
  'tests/fixtures/distribution/version-compatibility.json',
] as const;

function walkFiles(rootDir: string, startDir = rootDir): string[] {
  const entries = readdirSync(startDir, { withFileTypes: true });
  const files: string[] = [];

  for (const entry of entries) {
    if (['.git', 'node_modules', 'dist', 'coverage'].includes(entry.name)) {
      continue;
    }

    const fullPath = join(startDir, entry.name);
    if (entry.isDirectory()) {
      files.push(...walkFiles(rootDir, fullPath));
      continue;
    }

    files.push(fullPath);
  }

  return files;
}

function extractMarkdownLinkTargets(content: string): readonly string[] {
  const withoutCode = content.replace(/```[\s\S]*?```/g, '').replace(/`[^`\r\n]*`/g, '');
  return [...withoutCode.matchAll(/\[[^\]]+\]\(([^)]+)\)/g)]
    .map((match) => match[1]?.trim())
    .filter((target): target is string => Boolean(target));
}

function normalizeMarkdownLinkTarget(rawTarget: string): string | undefined {
  let target = rawTarget.trim();
  if (target.startsWith('<')) {
    const closingBracket = target.indexOf('>');
    target = closingBracket >= 0 ? target.slice(1, closingBracket) : target;
  } else {
    target = target.split(/\s+(?=["'])/)[0] ?? target;
  }
  const cleanTarget = target.split('#')[0]?.split('?')[0];
  return cleanTarget?.replaceAll('\\', '/').replace(/^\.\//, '') || undefined;
}

function validateMarkdownLinks(markdownPath: string, content: string): void {
  for (const rawTarget of extractMarkdownLinkTargets(content)) {
    const normalizedTarget = normalizeMarkdownLinkTarget(rawTarget);
    if (!normalizedTarget) continue;

    if (
      normalizedTarget.startsWith('http://') ||
      normalizedTarget.startsWith('https://') ||
      normalizedTarget.startsWith('mailto:') ||
      normalizedTarget.startsWith('#')
    ) {
      continue;
    }

    const resolvedTarget = isAbsolute(normalizedTarget)
      ? normalizedTarget
      : resolve(markdownPath, '..', normalizedTarget);

    if (!existsSync(resolvedTarget)) {
      fail(`README local link does not resolve: ${rawTarget}`);
    }
  }
}

function validateJsonFiles(files: readonly string[]): void {
  for (const filePath of files) {
    if (!filePath.endsWith('.json')) {
      continue;
    }

    JSON.parse(readFileSync(filePath, 'utf-8'));
  }
}

function validatePlaceholders(files: readonly string[]): void {
  const placeholderTokens = ['TO' + 'DO', 'TB' + 'D'];
  const placeholderPattern = new RegExp(`\\b(?:${placeholderTokens.join('|')})\\b`);
  const textExtensions = new Set([
    '.md',
    '.ts',
    '.tsx',
    '.js',
    '.json',
    '.yml',
    '.yaml',
    '.sql',
    '.html',
    '.css',
    '.mjs',
    '.cjs',
  ]);

  for (const filePath of files) {
    const extension = filePath.slice(filePath.lastIndexOf('.'));
    if (!textExtensions.has(extension)) {
      continue;
    }

    const content = readFileSync(filePath, 'utf-8');
    const match = content.match(placeholderPattern);
    if (match) {
      fail(
        `Unresolved placeholder marker ${match[0]} found in ${relative(process.cwd(), filePath) || filePath}`,
      );
    }
  }
}

function asRecord(value: unknown, label: string): Record<string, unknown> {
  if (typeof value !== 'object' || value === null || Array.isArray(value)) {
    fail(`${label} must contain a JSON object.`);
  }
  return value as Record<string, unknown>;
}

function readJsonObject(filePath: string, label: string): Record<string, unknown> {
  return asRecord(JSON.parse(readFileSync(filePath, 'utf-8')) as unknown, label);
}

function validateDistributionContract(
  rootDir: string,
  pkg: {
    readonly name?: string;
    readonly engines?: { readonly node?: string };
  },
): void {
  const adr = readFileSync(
    join(rootDir, 'docs/decisions/0002-distribution-filesystem-and-lifecycle.md'),
    'utf-8',
  );
  const operational = readFileSync(
    join(rootDir, 'docs/distribution/operational-cli-contract.md'),
    'utf-8',
  );
  if (!adr.includes('@krishna916/relay')) {
    fail('Distribution ADR must name the public package @krishna916/relay.');
  }
  if (!operational.includes('The final executable is `relay`')) {
    fail('Distribution contract must name relay as the public executable.');
  }
  if (pkg.name !== 'relay' && pkg.name !== '@krishna916/relay') {
    fail(
      `package.json#name must be relay for source checkout or @krishna916/relay for publication (got ${String(pkg.name)}).`,
    );
  }
  if (pkg.engines?.node !== '>=24 <25') {
    fail(`package.json#engines.node must be >=24 <25 (got ${String(pkg.engines?.node)}).`);
  }

  const supportedPlatforms = readJsonObject(
    join(rootDir, 'tests/fixtures/distribution/supported-platforms.json'),
    'supported-platforms.json',
  );
  if (supportedPlatforms.nodeMajor !== 24) {
    fail('Distribution supported-platforms fixture must require Node major 24.');
  }
  const supported = supportedPlatforms.supported;
  const expectedSupported = [
    { platform: 'win32', arch: 'x64', libc: 'n/a' },
    { platform: 'darwin', arch: 'arm64', libc: 'n/a' },
    { platform: 'linux', arch: 'x64', libc: 'glibc' },
  ];
  if (JSON.stringify(supported) !== JSON.stringify(expectedSupported)) {
    fail(
      'Distribution supported-platforms fixture must contain exactly the three supported tuples.',
    );
  }
  const expectedUnsupported = [
    { platform: 'win32', arch: 'arm64', reason: 'No release claim.' },
    { platform: 'darwin', arch: 'x64', reason: 'No release claim.' },
    { platform: 'linux', arch: 'arm64', reason: 'No release claim.' },
    {
      platform: 'linux-musl',
      arch: 'any',
      reason: 'better-sqlite3 compatibility is not claimed.',
    },
  ];
  if (JSON.stringify(supportedPlatforms.unsupported) !== JSON.stringify(expectedUnsupported)) {
    fail(
      'Distribution supported-platforms fixture must contain exactly the unsupported boundary set.',
    );
  }

  const pathResolution = readJsonObject(
    join(rootDir, 'tests/fixtures/distribution/path-resolution.json'),
    'path-resolution.json',
  );
  if (JSON.stringify(pathResolution.databaseEnvironmentOverrides) !== '["RELAY_DB_PATH"]') {
    fail(
      'Distribution path fixture must use only RELAY_DB_PATH as a database environment override.',
    );
  }

  const commands = readJsonObject(
    join(rootDir, 'tests/fixtures/distribution/operational-commands.json'),
    'operational-commands.json',
  );
  if (JSON.stringify(commands.commands) !== '["setup","mcp","ui","doctor","config"]') {
    fail('Distribution operational commands must be exactly setup, mcp, ui, doctor, config.');
  }

  const lifecycle = readJsonObject(
    join(rootDir, 'tests/fixtures/distribution/lifecycle-policy.json'),
    'lifecycle-policy.json',
  );
  if (lifecycle.downgradeSupported !== false) {
    fail('Distribution lifecycle fixture must mark downgrade support as false.');
  }
  if (lifecycle.normalUninstallRetainsData !== true) {
    fail('Distribution lifecycle fixture must retain data on normal uninstall.');
  }
  if (
    JSON.stringify(lifecycle.disableRetains) !==
    '["package","database","metadata","cache","backups"]'
  ) {
    fail(
      'Distribution lifecycle fixture must retain package, database, metadata, cache, and backups on disable.',
    );
  }
  if (
    JSON.stringify(lifecycle.integrationRemovalRetains) !==
    '["package","metadata","database","cache","backups","user-data"]'
  ) {
    fail(
      'Distribution lifecycle fixture must retain user data and backups on integration removal.',
    );
  }
  if (
    JSON.stringify(lifecycle.uninstallRetains) !==
    '["database","config","cache","backups","user-data"]'
  ) {
    fail(
      'Distribution lifecycle fixture must retain database, config, cache, backups, and user data on uninstall.',
    );
  }

  const compatibility = readJsonObject(
    join(rootDir, 'tests/fixtures/distribution/version-compatibility.json'),
    'version-compatibility.json',
  );
  if (compatibility.releaseTrigger !== 'manual-maintainer-action') {
    fail('Distribution version fixture must require a manual maintainer release action.');
  }
}

export function validateRepositoryAssets(options: ValidateRepositoryAssetsOptions = {}): void {
  const rootDir = options.rootDir ? resolve(options.rootDir) : process.cwd();

  // 1. Required files/directories
  const requiredPaths = [
    '.nvmrc',
    '.editorconfig',
    '.gitignore',
    '.prettierrc.json',
    'eslint.config.js',
    'package.json',
    'README.md',
    'docs/decisions/0002-agent-integration-contracts.md',
    'docs/mcp-tools.md',
    'docs/cli-reference.md',
    'docs/session-semantics.md',
    'docs/agent-skills.md',
    'skills/relay-capture/SKILL.md',
    'skills/relay-session-review/SKILL.md',
    'skills/fixtures/capture-positive.md',
    'skills/fixtures/capture-negative.md',
    'skills/fixtures/session-review-positive.md',
    'skills/fixtures/session-review-negative.md',
    'tests/fixtures/contracts/capture-success.json',
    'tests/fixtures/contracts/capture-duplicate-warning.json',
    'tests/fixtures/contracts/validation-error.json',
    'tests/fixtures/contracts/not-found-error.json',
    'tests/fixtures/contracts/transition-conflict-error.json',
    'tests/fixtures/contracts/storage-error.json',
    'tsconfig.base.json',
    'tsup.config.ts',
    'src/application/health/get-health.ts',
    'src/database/connection.ts',
    'src/interfaces/mcp/create-mcp-server.ts',
    'src/interfaces/http/create-http-server.ts',
    'src/interfaces/cli/main.ts',
    'src/interfaces/cli/run-cli.ts',
    'src/interfaces/cli/parse-cli.ts',
    'src/interfaces/contracts/contract-version.ts',
    'src/interfaces/contracts/error-contract.ts',
    'src/interfaces/contracts/json-value-contract.ts',
    'src/interfaces/contracts/session-contract.ts',
    'src/interfaces/contracts/task-contract.ts',
    'src/interfaces/contracts/warning-contract.ts',
    'web/src/App.tsx',
    ...requiredDistributionAssets,
  ];

  for (const p of requiredPaths) {
    if (!existsSync(join(rootDir, p))) {
      fail(`Required path missing: ${p}`);
    }
  }

  // 2. package.json bin validation
  const pkg = JSON.parse(readFileSync(join(rootDir, 'package.json'), 'utf-8')) as {
    name?: string;
    engines?: { node?: string };
    bin?: Record<string, string>;
  };
  validateDistributionContract(rootDir, pkg);
  const binRelayMcp = pkg.bin?.['relay-mcp'];
  const binRelay = pkg.bin?.relay;
  if (binRelay !== './dist/cli/main.js') {
    fail(`package.json#bin.relay must point to ./dist/cli/main.js (got ${String(binRelay)})`);
  }
  if (binRelayMcp !== './dist/mcp/main.js') {
    fail(
      `package.json#bin.relay-mcp must point to ./dist/mcp/main.js (got ${String(binRelayMcp)})`,
    );
  }

  // 3. Built MCP file existence after build
  if (!existsSync(join(rootDir, 'dist', 'mcp', 'main.js'))) {
    fail('Built MCP executable missing at dist/mcp/main.js. Run pnpm build first.');
  }
  if (!existsSync(join(rootDir, 'dist', 'cli', 'main.js'))) {
    fail('Built CLI executable missing at dist/cli/main.js. Run pnpm build first.');
  }

  const buildConfig = readFileSync(join(rootDir, 'tsup.config.ts'), 'utf-8');
  if (
    !buildConfig.includes("'cli/main'") ||
    !buildConfig.includes("'src/interfaces/cli/main.ts'")
  ) {
    fail('tsup.config.ts must build src/interfaces/cli/main.ts as cli/main.');
  }

  const readme = readFileSync(join(rootDir, 'README.md'), 'utf-8');
  const cliReference = readFileSync(join(rootDir, 'docs/cli-reference.md'), 'utf-8');
  if (!readme.includes('dist/cli/main.js') || !cliReference.includes('dist/cli/main.js')) {
    fail('README.md and docs/cli-reference.md must document the built CLI invocation.');
  }
  const readmeLinkTargets = new Set(
    extractMarkdownLinkTargets(readme)
      .map(normalizeMarkdownLinkTarget)
      .filter((target): target is string => Boolean(target)),
  );
  for (const requiredLink of [
    'docs/agent-skills.md',
    'skills/relay-capture/SKILL.md',
    'skills/relay-session-review/SKILL.md',
  ]) {
    if (!readmeLinkTargets.has(requiredLink)) {
      fail(`README.md must link to ${requiredLink}.`);
    }
  }

  const allFiles = walkFiles(rootDir);

  validateSkillAssets({ rootDir });
  validateAgentIntegrationAssets({ rootDir });
  validateMcpbAssets({ rootDir });

  validateJsonFiles(allFiles);
  validatePlaceholders(allFiles);
  validateMarkdownLinks(
    join(rootDir, 'README.md'),
    readFileSync(join(rootDir, 'README.md'), 'utf-8'),
  );

  // 4. No legacy agent integration roots
  const forbidden = ['agent/skills', 'agent/mcp'];
  for (const f of forbidden) {
    if (existsSync(join(rootDir, f))) {
      fail(`Forbidden asset for Issue #1 present: ${f}`);
    }
  }
}

if (import.meta.url === pathToFileURL(process.argv[1] ?? '').href) {
  try {
    validateRepositoryAssets();
    process.stdout.write('Repository asset validation passed successfully.\n');
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    process.stderr.write(`${message}\n`);
    process.exit(1);
  }
}
