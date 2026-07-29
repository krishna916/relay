import { cpSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
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

  it('rejects Claude guidance that uses CLAUDE.md imports instead of project skills', () => {
    const rootDir = createRoot();
    writeFileSync(
      join(rootDir, 'integrations/claude-code/README.md'),
      'Import skills from CLAUDE.md. skills/relay-capture/SKILL.md skills/relay-session-review/SKILL.md copy unchanged SQLite database remains untouched.',
    );

    expect(() => validateAgentIntegrationAssets({ rootDir })).toThrow(/claude.*\.claude\/skills/i);
  });

  it('rejects Claude guidance missing one project skill destination', () => {
    const rootDir = createRoot();
    const path = join(rootDir, 'integrations/claude-code/README.md');
    writeFileSync(
      path,
      readFileSync(path, 'utf8').replace('.claude/skills/relay-session-review/SKILL.md', ''),
    );

    expect(() => validateAgentIntegrationAssets({ rootDir })).toThrow(/claude.*\.claude\/skills/i);
  });

  it('rejects contradictory compatibility claims', () => {
    const rootDir = createRoot();
    writeFileSync(
      join(rootDir, 'docs/agent-integration.md'),
      'Version tested: current. Manual client smoke tests were not performed. relay_health task_capture task_list task_get task_find_similar session_captures_list SQLite database remains untouched.',
    );

    expect(() => validateAgentIntegrationAssets({ rootDir })).toThrow(/contradict/i);
  });

  it('requires the exact shipped MCP tool list in the generic README', () => {
    const rootDir = createRoot();
    const path = join(rootDir, 'integrations/generic-mcp/README.md');
    writeFileSync(
      path,
      readFileSync(path, 'utf8').replace('task_archive', 'unspecified mutation tools'),
    );

    expect(() => validateAgentIntegrationAssets({ rootDir })).toThrow(/task_archive/i);
  });

  it('rejects live evidence claims beside an incomplete vendor status', () => {
    const rootDir = createRoot();
    const path = join(rootDir, 'integrations/generic-mcp/README.md');
    writeFileSync(
      path,
      `${readFileSync(path, 'utf8')} Live smoke test: not completed. Live tool discovery was verified.`,
    );

    expect(() => validateAgentIntegrationAssets({ rootDir })).toThrow(/generic-mcp.*contradict/i);
  });

  it('rejects a shell command embedded in a config template', () => {
    const rootDir = createRoot();
    writeFileSync(
      join(rootDir, 'integrations/generic-mcp/server-config.json.example'),
      JSON.stringify({ command: 'node dist/mcp/main.js', args: [] }),
    );

    expect(() => validateAgentIntegrationAssets({ rootDir })).toThrow(/command and arguments/i);
  });

  it('rejects copied behavioural policy headings', () => {
    const rootDir = createRoot();
    writeFileSync(
      join(rootDir, 'integrations/codex/README.md'),
      '## Autonomy boundaries\nskills/relay-capture/SKILL.md skills/relay-session-review/SKILL.md .agents/skills/relay-capture/SKILL.md .agents/skills/relay-session-review/SKILL.md SQLite database remains untouched.',
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
