import { cpSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterEach, describe, expect, it } from 'vitest';
import { validateAgentIntegrationAssets } from '../../../scripts/validate-agent-integration-assets.js';

const fixtureRoot = join(process.cwd(), 'tests/fixtures/agent-integrations/valid');

describe('validateAgentIntegrationAssets', () => {
  const roots: string[] = [];

  function createRoot(): string {
    const rootDir = mkdtempSync(join(tmpdir(), 'relay-agent-integration-assets-'));
    cpSync(fixtureRoot, rootDir, { recursive: true });
    roots.push(rootDir);
    return rootDir;
  }

  afterEach(() => {
    for (const rootDir of roots) rmSync(rootDir, { recursive: true, force: true });
    roots.splice(0, roots.length);
  });

  it('accepts the complete integration asset fixture', () => {
    expect(() => validateAgentIntegrationAssets({ rootDir: createRoot() })).not.toThrow();
  });

  it('rejects a machine-specific Windows path', () => {
    const rootDir = createRoot();
    writeFileSync(
      join(rootDir, 'integrations/codex/README.md'),
      'C:/Users/name/relay skills/relay-capture/SKILL.md skills/relay-session-review/SKILL.md database remains',
    );

    expect(() => validateAgentIntegrationAssets({ rootDir })).toThrow(/machine-specific/i);
  });

  it('rejects a missing required asset', () => {
    const rootDir = createRoot();
    rmSync(join(rootDir, 'integrations/codex/config.toml.example'));

    expect(() => validateAgentIntegrationAssets({ rootDir })).toThrow(/required path/i);
  });

  it('rejects a vendor README without canonical skill references', () => {
    const rootDir = createRoot();
    writeFileSync(join(rootDir, 'integrations/generic-cli/README.md'), 'database remains');

    expect(() => validateAgentIntegrationAssets({ rootDir })).toThrow(/generic-cli.*skill/i);
  });

  it('rejects copied behavioural policy headings', () => {
    const rootDir = createRoot();
    writeFileSync(
      join(rootDir, 'integrations/codex/README.md'),
      '## Autonomy boundaries\nskills/relay-capture/SKILL.md skills/relay-session-review/SKILL.md database remains',
    );

    expect(() => validateAgentIntegrationAssets({ rootDir })).toThrow(/behavioural policy/i);
  });

  it('rejects invalid JSON and TOML templates', () => {
    const rootDir = createRoot();
    writeFileSync(join(rootDir, 'integrations/generic-mcp/server-config.json.example'), '{');

    expect(() => validateAgentIntegrationAssets({ rootDir })).toThrow();
  });

  it('rejects an unqualified packaged relay mcp command', () => {
    const rootDir = createRoot();
    writeFileSync(
      join(rootDir, 'docs/agent-integration.md'),
      'relay_health task_capture task_list task_get task_find_similar session_captures_list Use relay mcp now.',
    );

    expect(() => validateAgentIntegrationAssets({ rootDir })).toThrow(/future-only/i);
  });
});
