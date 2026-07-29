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

const canonicalSkills = [
  'skills/relay-capture/SKILL.md',
  'skills/relay-session-review/SKILL.md',
] as const;

const vendorReadmes = ['generic-mcp', 'generic-cli', 'codex', 'claude-code'] as const;

const expectedCoreMcpTools = [
  'relay_health',
  'task_capture',
  'task_list',
  'task_get',
  'task_find_similar',
  'session_captures_list',
] as const;

const expectedMutationMcpTools = [
  'task_edit',
  'task_triage',
  'task_start',
  'task_complete',
  'task_archive',
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

function readAsset(rootDir: string, path: string): string {
  return readFileSync(join(rootDir, path), 'utf8');
}

function requireText(text: string, expected: string, message: string): void {
  if (!text.includes(expected)) fail(message);
}

function validateCompatibilityClaims(shared: string): void {
  const claimsTesting = /(?:version tested|tested on|verified client version)/i.test(shared);
  const claimsNoSmokeTest =
    /(?:live smoke test|manual client smoke test)[^\n]*not completed|(?:smoke tests?|live validation)[^\n]*not performed/i.test(
      shared,
    );
  if (claimsTesting && claimsNoSmokeTest) {
    fail('Compatibility documentation contradicts its live-validation status.');
  }
}

function validateVendorClaims(rootDir: string, shared: string): void {
  for (const readme of vendorReadmes) {
    const text = readAsset(rootDir, `integrations/${readme}/README.md`);
    const claimsNoLiveTest = /(?:live smoke test|live validation)[^\n]*not completed/i.test(text);
    const claimsLiveEvidence =
      /(?:live|manual)[^\n]*(?:tested|performed|verified|discovered|captured)/i.test(text);
    if (claimsNoLiveTest && claimsLiveEvidence) {
      fail(`${readme} README contradicts its live-validation status.`);
    }
  }

  const claudeValidationText = `${readAsset(rootDir, 'integrations/claude-code/README.md')}\n${shared}`;
  for (const [label, pattern] of [
    ['deferred Claude validation status', /## Deferred live validation/i],
    ['unavailable Claude status', /Claude Code was unavailable|Claude Code.*not completed/i],
    ['official Claude source evidence', /https:\/\/code\.claude\.com\/docs\/en\/(?:mcp|skills)/i],
    ['Claude validation limitations', /## Current limitations/i],
  ] as const) {
    if (!pattern.test(claudeValidationText))
      fail(`Claude validation assets must include ${label}.`);
  }
  for (let step = 1; step <= 15; step += 1) {
    if (!new RegExp(`^\\s*${step}\\.\\s+`, 'm').test(claudeValidationText))
      fail(`Claude validation assets must include 15-step checklist item ${step}.`);
  }
}

function validateTemplateShape(rootDir: string): void {
  const expectedMcpPath = '/tmp/relay-checkout/dist/mcp/main.js';
  const jsonTemplates = [
    'integrations/generic-mcp/server-config.json.example',
    'integrations/claude-code/.mcp.json.example',
  ] as const;

  for (const path of jsonTemplates) {
    const source = readAsset(rootDir, path);
    if (/(?:[A-Z]:[\\/]Users[\\/]|\/Users\/|\/home\/|~\/)/i.test(source)) {
      fail(`${path} must not contain a machine-specific home path.`);
    }
    const parsed = JSON.parse(source.replaceAll('__RELAY_CHECKOUT__', '/tmp/relay-checkout')) as {
      command?: unknown;
      args?: unknown;
      mcpServers?: Record<string, { command?: unknown; args?: unknown }>;
    };
    const server = parsed.mcpServers?.relay ?? parsed;
    if (server.command !== 'node' || !Array.isArray(server.args) || server.args.length !== 1) {
      fail(`${path} must separate command and arguments for a stdio server.`);
    }
    if (server.args[0] !== expectedMcpPath) {
      fail(`${path} must use the exact dist/mcp/main.js entry path.`);
    }
    if (typeof server.command !== 'string' || /[\\/\s]/.test(server.command)) {
      fail(`${path} must not embed a shell command in command.`);
    }
  }

  const tomlSource = readAsset(rootDir, 'integrations/codex/config.toml.example');
  if (/(?:[A-Z]:[\\/]Users[\\/]|\/Users\/|\/home\/|~\/)/i.test(tomlSource)) {
    fail('integrations/codex/config.toml.example must not contain a machine-specific home path.');
  }
  const toml = parse(tomlSource.replaceAll('__RELAY_CHECKOUT__', '/tmp/relay-checkout')) as {
    mcp_servers?: {
      relay?: {
        command?: unknown;
        args?: unknown;
        env?: { RELAY_DB_PATH?: unknown };
      };
    };
  };
  const codexServer = toml.mcp_servers?.relay;
  if (
    codexServer?.command !== 'node' ||
    !Array.isArray(codexServer.args) ||
    codexServer.args.length !== 1 ||
    codexServer.args[0] !== expectedMcpPath
  ) {
    fail(
      'integrations/codex/config.toml.example must use node plus dist/mcp/main.js as separate fields.',
    );
  }
  if (codexServer.env?.RELAY_DB_PATH !== '/tmp/relay-checkout/.relay-validation/relay.db') {
    fail('integrations/codex/config.toml.example must configure an isolated RELAY_DB_PATH.');
  }
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
  const shared = readAsset(rootDir, 'docs/agent-integration.md');
  const troubleshooting = readAsset(rootDir, 'docs/troubleshooting-agent-integration.md');
  const all = `${contents}\n${shared}\n${troubleshooting}`;

  if (/(?:[A-Z]:[\\/]Users[\\/]|\/Users\/|\/home\/|~\/)[^\s"'`]+/i.test(all))
    fail('Machine-specific absolute path found.');
  for (const skill of canonicalSkills) {
    for (const readme of vendorReadmes) {
      const text = readAsset(rootDir, `integrations/${readme}/README.md`);
      requireText(text, skill, `${readme} README must reference ${skill}.`);
    }
  }
  const claudeReadme = readAsset(rootDir, 'integrations/claude-code/README.md');
  for (const path of ['.claude/skills/relay-capture/', '.claude/skills/relay-session-review/']) {
    requireText(claudeReadme, path, `Claude README must document ${path}.`);
  }
  const codexReadme = readAsset(rootDir, 'integrations/codex/README.md');
  for (const path of ['.agents/skills/relay-capture/', '.agents/skills/relay-session-review/']) {
    requireText(codexReadme, path, `Codex README must document ${path}.`);
  }
  const genericMcpReadme = readAsset(rootDir, 'integrations/generic-mcp/README.md');
  for (const tool of expectedCoreMcpTools) {
    requireText(genericMcpReadme, tool, `Generic MCP README must list ${tool}.`);
  }
  const documentsMutationTools =
    existsSync(join(rootDir, 'docs/mcp-tools.md')) &&
    readAsset(rootDir, 'docs/mcp-tools.md').includes('task_archive');
  if (documentsMutationTools) {
    for (const tool of expectedMutationMcpTools) {
      requireText(genericMcpReadme, tool, `Generic MCP README must list ${tool}.`);
    }
  }
  const genericMcpValidation =
    /validation[\s\S]*RELAY_DB_PATH[\s\S]*(?:must|required|explicit|omit|omission|permitted|default)/i.test(
      genericMcpReadme,
    );
  if (!genericMcpValidation)
    fail(
      'Generic MCP README must distinguish isolated validation from non-validation database use.',
    );
  const genericCliReadme = readAsset(rootDir, 'integrations/generic-cli/README.md');
  if (!/export\s+RELAY_DB_PATH\s*=\s*["']?[^\n]*\.relay-validation[\\/]/i.test(genericCliReadme))
    fail('Generic CLI README must set an isolated RELAY_DB_PATH before validation commands.');
  validateCompatibilityClaims(shared);
  validateVendorClaims(rootDir, shared);
  if (/CLAUDE\.md[\s\S]*(?:skill|import)|(?:skill|import)[\s\S]*CLAUDE\.md/i.test(claudeReadme))
    fail('Claude README must use .claude/skills for skill discovery, not CLAUDE.md imports.');
  if (!/copy|symlink/i.test(claudeReadme) || !/unchanged/i.test(claudeReadme))
    fail('Claude README must preserve complete canonical skill directories unchanged.');
  if (/^## Autonomy boundaries$/m.test(contents))
    fail('Vendor assets must not copy behavioural policy.');
  for (const readme of vendorReadmes) {
    const text = readAsset(rootDir, `integrations/${readme}/README.md`);
    if (!/SQLite database remains untouched/i.test(text))
      fail(`${readme} removal guidance must state that the SQLite database remains untouched.`);
  }
  for (const match of all.matchAll(/relay mcp/gi)) {
    const context = all.slice(Math.max(0, match.index! - 80), match.index! + 100);
    if (!/(future|not available|Epic #18)/i.test(context))
      fail('relay mcp must be marked as future-only.');
  }
  validateTemplateShape(rootDir);
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
