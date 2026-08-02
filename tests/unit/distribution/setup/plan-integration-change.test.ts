import { readFileSync } from 'node:fs';
import { mkdtempSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import { createCodexTomlAdapter } from '../../../../src/distribution/setup/clients/codex-toml-adapter.js';
import { planIntegrationChange } from '../../../../src/distribution/setup/plan-integration-change.js';
import {
  SetupConflictError,
  SetupNotFoundError,
} from '../../../../src/distribution/setup/setup-errors.js';

describe('planIntegrationChange', () => {
  it('plans an absent Relay entry as created without writing', async () => {
    const root = mkdtempSync(join(tmpdir(), 'relay-plan-'));
    const path = join(root, 'codex.toml');
    writeFileSync(
      path,
      readFileSync(join(process.cwd(), 'tests/fixtures/setup/codex/unrelated.toml')),
    );
    const before = readFileSync(path, 'utf8');
    const plan = await planIntegrationChange({
      action: 'setup',
      client: 'codex',
      configPath: path,
      adapter: createCodexTomlAdapter(),
      ownership: { schemaVersion: 1, integrations: [] },
    });
    expect(plan.operation).toBe('created');
    expect(readFileSync(path, 'utf8')).toBe(before);
  });

  it('requires ownership even when the installed entry matches', async () => {
    const root = mkdtempSync(join(tmpdir(), 'relay-plan-'));
    const path = join(root, 'codex.toml');
    writeFileSync(path, '[mcp_servers.relay]\ncommand = "relay"\nargs = ["mcp"]\n');
    await expect(
      planIntegrationChange({
        action: 'setup',
        client: 'codex',
        configPath: path,
        adapter: createCodexTomlAdapter(),
        ownership: { schemaVersion: 1, integrations: [] },
      }),
    ).rejects.toBeInstanceOf(SetupConflictError);
  });

  it('requires enabled ownership for disable', async () => {
    const root = mkdtempSync(join(tmpdir(), 'relay-plan-'));
    const path = join(root, 'codex.toml');
    writeFileSync(path, '[mcp_servers.relay]\ncommand = "relay"\nargs = ["mcp"]\n');
    await expect(
      planIntegrationChange({
        action: 'disable',
        client: 'codex',
        configPath: path,
        adapter: createCodexTomlAdapter(),
        ownership: { schemaVersion: 1, integrations: [] },
      }),
    ).rejects.toBeInstanceOf(SetupNotFoundError);
  });
});
