import { existsSync, readFileSync } from 'node:fs';
import { join, resolve } from 'node:path';

export interface ValidateMcpbAssetsOptions {
  readonly rootDir?: string;
}

function fail(message: string): never {
  throw new Error(`[MCPB ASSET VALIDATION FAILURE] ${message}`);
}
function json<T>(path: string): T {
  return JSON.parse(readFileSync(path, 'utf8')) as T;
}

export function validateMcpbAssets(options: ValidateMcpbAssetsOptions = {}): void {
  const rootDir = resolve(options.rootDir ?? process.cwd());
  const sourceDir = join(rootDir, 'integrations', 'claude-desktop');
  for (const file of [
    'manifest.json',
    'package.json',
    'pnpm-lock.yaml',
    '.mcpbignore',
    'NOTICE.md',
    'README.md',
  ])
    if (!existsSync(join(sourceDir, file))) fail(`Required MCPB asset missing: ${file}`);
  const root = json<{
    version?: string;
    engines?: { node?: string };
    devDependencies?: Record<string, string>;
    scripts?: Record<string, string>;
  }>(join(rootDir, 'package.json'));
  const manifest = json<{
    manifest_version?: string;
    name?: string;
    version?: string;
    tools_generated?: boolean;
    tools?: unknown;
    compatibility?: { platforms?: string[]; runtimes?: { node?: string } };
    server?: { entry_point?: string; mcp_config?: { command?: string; args?: string[] } };
  }>(join(sourceDir, 'manifest.json'));
  const runtime = json<{
    version?: string;
    engines?: { node?: string };
    dependencies?: Record<string, string>;
  }>(join(sourceDir, 'package.json'));
  if (manifest.manifest_version !== '0.3' || manifest.name !== 'relay')
    fail('Manifest must declare MCPB 0.3 and name relay.');
  if (
    manifest.server?.entry_point !== 'server/main.js' ||
    manifest.server.mcp_config?.command !== 'node' ||
    !manifest.server.mcp_config.args?.includes('${__dirname}/server/main.js')
  )
    fail('Manifest must launch the canonical Node server/main.js entry.');
  if (JSON.stringify(manifest.compatibility?.platforms) !== JSON.stringify(['linux']))
    fail('Manifest platforms must be exactly [linux].');
  if (!root.version || manifest.version !== root.version || runtime.version !== root.version)
    fail('Root, manifest, and runtime package versions must match.');
  if (
    !root.engines?.node ||
    manifest.compatibility?.runtimes?.node !== root.engines.node ||
    runtime.engines?.node !== root.engines.node
  )
    fail('Root, manifest, and runtime Node engines must match.');
  const required = ['@modelcontextprotocol/sdk', 'better-sqlite3', 'zod'];
  if (
    JSON.stringify(Object.keys(runtime.dependencies ?? {}).sort()) !==
    JSON.stringify(required.sort())
  )
    fail('Runtime dependencies must be exactly the minimal MCP SDK, SQLite, and Zod set.');
  if (manifest.tools_generated && manifest.tools)
    fail('Generated MCPB tools must not duplicate static tool arrays.');
  if (root.devDependencies?.['@anthropic-ai/mcpb'] !== '2.1.2')
    fail('Root must pin @anthropic-ai/mcpb to 2.1.2.');
  for (const script of [
    'build:mcpb:stage',
    'validate:mcpb',
    'verify:mcpb:stage',
    'pack:mcpb',
    'build:mcpb',
  ])
    if (!root.scripts?.[script]) fail(`Root package is missing ${script}.`);
  const ignored = readFileSync(join(sourceDir, '.mcpbignore'), 'utf8');
  for (const value of ['.env', '*.db', '*.log', '*.map', 'tests/', 'coverage/'])
    if (!ignored.includes(value)) fail(`.mcpbignore must exclude ${value}.`);
  const notice = readFileSync(join(sourceDir, 'NOTICE.md'), 'utf8');
  const readme = readFileSync(join(sourceDir, 'README.md'), 'utf8');
  if (
    !notice.includes('Removing the extension does not authorize deleting the Relay database.') ||
    !readme.includes('unsigned') ||
    !readme.includes('does not delete the Relay database')
  )
    fail(
      'MCPB documentation must preserve the Relay database and describe unsigned local evaluation.',
    );
}
