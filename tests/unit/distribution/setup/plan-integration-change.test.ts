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

  it('plans a missing configuration file as created', async () => {
    const root = mkdtempSync(join(tmpdir(), 'relay-plan-'));
    const path = join(root, 'missing.toml');
    const plan = await planIntegrationChange({
      action: 'setup',
      client: 'codex',
      configPath: path,
      adapter: createCodexTomlAdapter(),
      ownership: { schemaVersion: 1, integrations: [] },
    });

    expect(plan.operation).toBe('created');
    expect(plan.changed).toBe(true);
    expect(plan.nextContent).toContain('[mcp_servers.relay]');
  });

  it('plans disabling an enabled Relay entry', async () => {
    const root = mkdtempSync(join(tmpdir(), 'relay-plan-'));
    const path = join(root, 'codex.toml');
    const content = '[mcp_servers.relay]\ncommand = "relay"\nargs = ["mcp"]\n';
    writeFileSync(path, content);
    const plan = await planIntegrationChange({
      action: 'disable',
      client: 'codex',
      configPath: path,
      adapter: createCodexTomlAdapter(),
      ownership: {
        schemaVersion: 1,
        integrations: [
          {
            client: 'codex',
            configPath: path,
            entryId: 'relay',
            command: 'relay',
            args: ['mcp'],
            status: 'enabled',
            applicationVersion: '0.1.0',
            lastSuccessfulSetupAt: '2026-08-02T00:00:00.000Z',
          },
        ],
      },
    });

    expect(plan.operation).toBe('disabled');
    expect(plan.changed).toBe(true);
    expect(plan.nextContent).not.toContain('mcp_servers.relay');
  });

  it('plans removing a disabled Relay entry without rewriting the client file', async () => {
    const root = mkdtempSync(join(tmpdir(), 'relay-plan-'));
    const path = join(root, 'codex.toml');
    const content = '[profile]\nname = "unrelated"\n';
    writeFileSync(path, content);
    const plan = await planIntegrationChange({
      action: 'remove',
      client: 'codex',
      configPath: path,
      adapter: createCodexTomlAdapter(),
      ownership: {
        schemaVersion: 1,
        integrations: [
          {
            client: 'codex',
            configPath: path,
            entryId: 'relay',
            command: 'relay',
            args: ['mcp'],
            status: 'disabled',
            applicationVersion: '0.1.0',
            lastSuccessfulSetupAt: '2026-08-02T00:00:00.000Z',
          },
        ],
      },
    });

    expect(plan.operation).toBe('removed');
    expect(plan.changed).toBe(true);
    expect(plan.nextContent).toBe(content);
  });

  it('plans re-enabling a disabled matching Relay entry', async () => {
    const root = mkdtempSync(join(tmpdir(), 'relay-plan-'));
    const path = join(root, 'codex.toml');
    const content = '[mcp_servers.relay]\ncommand = "relay"\nargs = ["mcp"]\n';
    writeFileSync(path, content);
    const plan = await planIntegrationChange({
      action: 'setup',
      client: 'codex',
      configPath: path,
      adapter: createCodexTomlAdapter(),
      ownership: {
        schemaVersion: 1,
        integrations: [
          {
            client: 'codex',
            configPath: path,
            entryId: 'relay',
            command: 'relay',
            args: ['mcp'],
            status: 'disabled',
            applicationVersion: '0.1.0',
            lastSuccessfulSetupAt: '2026-08-02T00:00:00.000Z',
          },
        ],
      },
    });

    expect(plan.operation).toBe('updated');
    expect(plan.changed).toBe(true);
    expect(plan.nextContent).toBe(content);
  });
});
