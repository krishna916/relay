import { existsSync, readFileSync, readdirSync } from 'node:fs';
import { join, resolve } from 'node:path';
import { parse } from '@iarna/toml';

export interface ValidateAgentIntegrationAssetsOptions {
  readonly rootDir?: string;
}

const requiredPaths = [
  'docs/agent-integration.md',
  'docs/troubleshooting-agent-integration.md',
  'integrations/generic-mcp/server-config.json.example',
  'integrations/generic-mcp/README.md',
  'integrations/generic-cli/README.md',
  'integrations/codex/config.toml.example',
  'integrations/codex/README.md',
  'integrations/claude-code/.mcp.json.example',
  'integrations/claude-code/README.md',
] as const;

function fail(message: string): never {
  throw new Error(`[AGENT INTEGRATION ASSET FAILURE] ${message}`);
}

function filesUnder(dir: string): string[] {
  return readdirSync(dir, { withFileTypes: true }).flatMap((entry) => {
    const path = join(dir, entry.name);
    return entry.isDirectory() ? filesUnder(path) : [path];
  });
}

export function validateAgentIntegrationAssets(
  options: ValidateAgentIntegrationAssetsOptions = {},
): void {
  const rootDir = options.rootDir ? resolve(options.rootDir) : process.cwd();
  for (const path of requiredPaths) {
    if (!existsSync(join(rootDir, path))) fail(`Required path missing: ${path}`);
  }

  const integrationRoot = join(rootDir, 'integrations');
  const contents = filesUnder(integrationRoot)
    .map((file) => readFileSync(file, 'utf8'))
    .join('\n');
  const shared = readFileSync(join(rootDir, 'docs/agent-integration.md'), 'utf8');
  const troubleshooting = readFileSync(
    join(rootDir, 'docs/troubleshooting-agent-integration.md'),
    'utf8',
  );
  const all = `${contents}\n${shared}\n${troubleshooting}`;

  if (/(?:[A-Z]:[\\/]Users[\\/]|\/Users\/)[^\s"'`]+/i.test(all))
    fail('Machine-specific absolute path found.');
  for (const skill of ['skills/relay-capture/SKILL.md', 'skills/relay-session-review/SKILL.md']) {
    for (const readme of ['generic-mcp', 'generic-cli', 'codex', 'claude-code']) {
      const text = readFileSync(join(integrationRoot, readme, 'README.md'), 'utf8');
      if (!text.includes(skill)) fail(`${readme} README must reference ${skill}.`);
    }
  }
  for (const tool of [
    'relay_health',
    'task_capture',
    'task_list',
    'task_get',
    'task_find_similar',
    'session_captures_list',
  ]) {
    if (
      !shared.includes(tool) &&
      !readFileSync(join(integrationRoot, 'generic-mcp/README.md'), 'utf8').includes(tool)
    )
      fail(`Missing MCP tool ${tool}.`);
  }
  if (/^## Autonomy boundaries$/m.test(contents))
    fail('Vendor assets must not copy behavioural policy.');
  for (const readme of ['generic-mcp', 'generic-cli', 'codex', 'claude-code']) {
    const text = readFileSync(join(integrationRoot, readme, 'README.md'), 'utf8');
    if (!/(database remains|preserve.{0,40}database)/is.test(text))
      fail(`${readme} removal guidance must preserve the database.`);
  }
  for (const match of all.matchAll(/relay mcp/gi)) {
    const context = all.slice(Math.max(0, match.index! - 80), match.index! + 100);
    if (!/(future|not available|Epic #18)/i.test(context))
      fail('relay mcp must be marked as future-only.');
  }
  const replaceCheckout = (text: string) =>
    text.replaceAll('__RELAY_CHECKOUT__', '/tmp/relay-checkout');
  JSON.parse(
    replaceCheckout(
      readFileSync(join(integrationRoot, 'generic-mcp/server-config.json.example'), 'utf8'),
    ),
  );
  JSON.parse(
    replaceCheckout(readFileSync(join(integrationRoot, 'claude-code/.mcp.json.example'), 'utf8')),
  );
  parse(replaceCheckout(readFileSync(join(integrationRoot, 'codex/config.toml.example'), 'utf8')));
}
