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
    cpSync(join(process.cwd(), 'skills'), join(rootDir, 'skills'), { recursive: true });
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

  it.each(['/home/name/relay', '~/relay'])('rejects a machine-specific path: %s', (path) => {
    const rootDir = createRoot();
    writeFileSync(
      join(rootDir, 'integrations/codex/README.md'),
      `${path} skills/relay-capture/SKILL.md skills/relay-session-review/SKILL.md .agents/skills/relay-capture/ .agents/skills/relay-session-review/ SQLite database remains untouched`,
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
      readFileSync(path, 'utf8').replace('.claude/skills/relay-session-review/', ''),
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

  it('requires the shipped mutation MCP tools in the production README', () => {
    const rootDir = createRoot();
    writeFileSync(join(rootDir, 'docs/mcp-tools.md'), '# MCP tools\n\ntask_archive\n');
    const path = join(rootDir, 'integrations/generic-mcp/README.md');
    writeFileSync(
      path,
      `${readFileSync(path, 'utf8')} task_edit task_triage task_start task_complete task_archive`.replace(
        'task_archive',
        'unspecified mutation tools',
      ),
    );

    expect(() => validateAgentIntegrationAssets({ rootDir })).toThrow(/task_archive/i);
  });

  it('rejects a Codex config that falls back to the default database', () => {
    const rootDir = createRoot();
    const path = join(rootDir, 'integrations/codex/config.toml.example');
    writeFileSync(
      path,
      readFileSync(path, 'utf8').replace(
        'RELAY_DB_PATH = "__RELAY_CHECKOUT__/.relay-validation/relay.db"',
        'RELAY_DB_PATH = "/default/relay.db"',
      ),
    );

    expect(() => validateAgentIntegrationAssets({ rootDir })).toThrow(/isolated.*RELAY_DB_PATH/i);
  });

  it('rejects generic MCP guidance without explicit validation database isolation', () => {
    const rootDir = createRoot();
    const path = join(rootDir, 'integrations/generic-mcp/README.md');
    writeFileSync(
      path,
      readFileSync(path, 'utf8').replace(
        'Validation requires explicit isolated RELAY_DB_PATH; omission is permitted only for non-validation use.',
        'The database is available.',
      ),
    );

    expect(() => validateAgentIntegrationAssets({ rootDir })).toThrow(/generic MCP.*distinguish/i);
  });

  it('rejects generic CLI guidance without an isolated export', () => {
    const rootDir = createRoot();
    const path = join(rootDir, 'integrations/generic-cli/README.md');
    writeFileSync(
      path,
      readFileSync(path, 'utf8').replace(
        'export RELAY_DB_PATH="__RELAY_CHECKOUT__/.relay-validation/relay.db"',
        'RELAY_DB_PATH uses the default database',
      ),
    );

    expect(() => validateAgentIntegrationAssets({ rootDir })).toThrow(/generic CLI.*isolated/i);
  });

  it.each([
    ['deferred Claude validation status', '## Deferred live validation'],
    ['unavailable Claude status', 'Claude Code was unavailable'],
    ['official Claude source evidence', 'https://code.claude.com/docs/en/mcp'],
    ['Claude validation limitations', '## Current limitations'],
    ['15-step Claude validation checklist', '15. Record evidence and limitations.'],
  ])('rejects Claude validation assets missing %s', (_label, marker) => {
    const rootDir = createRoot();
    const path = join(rootDir, 'docs/agent-integration.md');
    const source = readFileSync(path, 'utf8');
    const updated = marker.startsWith('https://')
      ? source
          .replaceAll('https://code.claude.com/docs/en/mcp', 'removed marker')
          .replaceAll('https://code.claude.com/docs/en/skills', 'removed marker')
      : source.replace(marker, 'removed marker');
    writeFileSync(path, updated);

    expect(() => validateAgentIntegrationAssets({ rootDir })).toThrow(/Claude validation assets/i);
  });

  it('rejects a Claude validation checklist missing an intermediate step', () => {
    const rootDir = createRoot();
    const path = join(rootDir, 'docs/agent-integration.md');
    writeFileSync(
      path,
      readFileSync(path, 'utf8').replace(
        '7. Install the canonical skills.',
        'removed checklist step',
      ),
    );

    expect(() => validateAgentIntegrationAssets({ rootDir })).toThrow(/15-step checklist item 7/i);
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
      '## Autonomy boundaries\nskills/relay-capture/SKILL.md skills/relay-session-review/SKILL.md .agents/skills/relay-capture/ .agents/skills/relay-session-review/ SQLite database remains untouched.',
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
    const path = join(rootDir, 'docs/agent-integration.md');
    writeFileSync(path, `${readFileSync(path, 'utf8')} Use relay mcp now.`);

    expect(() => validateAgentIntegrationAssets({ rootDir })).toThrow(/future-only/i);
  });

  it('rejects a canonical capture skill without autonomous-create permission', () => {
    const rootDir = createRoot();
    const path = join(rootDir, 'skills/relay-capture/SKILL.md');
    writeFileSync(path, readFileSync(path, 'utf8').replace('autonomously create only', 'may create only'));

    expect(() => validateAgentIntegrationAssets({ rootDir })).toThrow(/canonical capture.*autonom/i);
  });

  it('rejects a canonical capture skill that permits lifecycle mutation', () => {
    const rootDir = createRoot();
    const path = join(rootDir, 'skills/relay-capture/SKILL.md');
    writeFileSync(
      path,
      readFileSync(path, 'utf8').replace(
        'It must not edit, triage, start, complete, archive, delete, merge, or move any task',
        'It may edit, triage, start, complete, archive, delete, merge, or move any task',
      ),
    );

    expect(() => validateAgentIntegrationAssets({ rootDir })).toThrow(/canonical capture.*lifecycle/i);
  });

  it('rejects a canonical session-review skill that omits completed and archived captures', () => {
    const rootDir = createRoot();
    const path = join(rootDir, 'skills/relay-session-review/SKILL.md');
    writeFileSync(path, readFileSync(path, 'utf8').replace('completed and archived captures', 'INBOX tasks'));

    expect(() => validateAgentIntegrationAssets({ rootDir })).toThrow(/session-review.*status/i);
  });

  it('rejects a canonical session-review skill without explicit user-action guidance', () => {
    const rootDir = createRoot();
    const path = join(rootDir, 'skills/relay-session-review/SKILL.md');
    writeFileSync(path, readFileSync(path, 'utf8').replaceAll('explicit user direction', 'automatic action'));

    expect(() => validateAgentIntegrationAssets({ rootDir })).toThrow(/session-review.*explicit/i);
  });

  it('rejects a vendor wrapper that copies mutation autonomy policy', () => {
    const rootDir = createRoot();
    const path = join(rootDir, 'integrations/generic-cli/README.md');
    writeFileSync(
      path,
      `${readFileSync(path, 'utf8')}\n## Autonomy boundaries\nThe agent may autonomously edit and archive tasks.`,
    );

    expect(() => validateAgentIntegrationAssets({ rootDir })).toThrow(/vendor.*policy|behavioural policy/i);
  });

  it('rejects a vendor wrapper without both canonical skill references', () => {
    const rootDir = createRoot();
    const path = join(rootDir, 'integrations/generic-mcp/README.md');
    writeFileSync(path, readFileSync(path, 'utf8').replace('skills/relay-session-review/SKILL.md', ''));

    expect(() => validateAgentIntegrationAssets({ rootDir })).toThrow(/generic-mcp.*skill/i);
  });

  it('rejects a configuration template that points at a non-canonical MCP entry', () => {
    const rootDir = createRoot();
    const path = join(rootDir, 'integrations/generic-mcp/server-config.json.example');
    writeFileSync(path, readFileSync(path, 'utf8').replace('dist/mcp/main.js', 'dist/other-mcp.js'));

    expect(() => validateAgentIntegrationAssets({ rootDir })).toThrow(/canonical.*dist\/mcp\/main\.js/i);
  });

  it('rejects removal guidance that deletes the SQLite database', () => {
    const rootDir = createRoot();
    const path = join(rootDir, 'integrations/generic-cli/README.md');
    writeFileSync(path, `${readFileSync(path, 'utf8')} Remove the SQLite database when disabling Relay.`);

    expect(() => validateAgentIntegrationAssets({ rootDir })).toThrow(/removal.*database|destructive/i);
  });

  it('rejects removal guidance that does not distinguish configuration from stored data', () => {
    const rootDir = createRoot();
    const path = join(rootDir, 'integrations/generic-cli/README.md');
    writeFileSync(
      path,
      readFileSync(path, 'utf8').replace('SQLite database remains untouched', 'Relay data may be deleted'),
    );

    expect(() => validateAgentIntegrationAssets({ rootDir })).toThrow(/removal.*configuration|database remains/i);
  });
});
