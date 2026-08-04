import { constants } from 'node:fs';
import type { access, readFile } from 'node:fs/promises';
import { join } from 'node:path';
import type { ClientConfigAdapter } from '../setup/clients/client-adapter.js';
import type { MutableIntegrationClient } from '../setup/setup-types.js';
import type { OwnershipStore } from '../setup/ownership-store.js';
import type { DoctorCheck } from './doctor-types.js';

export function createIntegrationChecks(input: {
  readonly ownershipStore: OwnershipStore;
  readonly adapters: Readonly<Record<MutableIntegrationClient, ClientConfigAdapter>>;
  readonly integrationsDir: string;
  readonly readFile: typeof readFile;
  readonly access: typeof access;
}): readonly [DoctorCheck, DoctorCheck, DoctorCheck] {
  return [
    createNativeClientCheck('codex'),
    createNativeClientCheck('claude-code'),
    createGenericCheck(),
  ];

  function createNativeClientCheck(client: MutableIntegrationClient): DoctorCheck {
    const label = client === 'codex' ? 'Codex' : 'Claude Code';
    return {
      id: `integrations.${client}`,
      run: async () => {
        let ownership;
        try {
          ownership = await input.ownershipStore.read();
        } catch {
          return {
            status: 'failure',
            code: `integrations.${client}.ownership-invalid`,
            message: `Relay ownership metadata for ${label} could not be read safely.`,
          };
        }
        const records = ownership.integrations
          .filter((record) => record.client === client)
          .slice()
          .sort((left, right) => left.configPath.localeCompare(right.configPath));
        if (records.length === 0) {
          return {
            status: 'warning',
            code: `integrations.${client}.not-configured`,
            message: `Relay has no owned ${label} configuration entry.`,
          };
        }
        const enabled = records.filter((record) => record.status === 'enabled');
        if (enabled.length === 0) {
          return {
            status: 'warning',
            code: `integrations.${client}.disabled`,
            message: `The owned ${label} Relay configuration entry is disabled.`,
            details: { records: records.length, enabled: 0 },
          };
        }
        const adapter = input.adapters[client];
        for (const record of enabled) {
          try {
            await input.access(record.configPath, constants.R_OK);
            const content = await input.readFile(record.configPath, 'utf8');
            adapter.parse(content);
            if (adapter.inspect(content).kind !== 'matching') {
              return {
                status: 'failure',
                code: `integrations.${client}.entry-conflict`,
                message: `The owned ${label} Relay entry is missing or conflicting.`,
              };
            }
          } catch {
            return {
              status: 'failure',
              code: `integrations.${client}.file-unreadable`,
              message: `The owned ${label} configuration file could not be validated safely.`,
            };
          }
        }
        return {
          status: 'healthy',
          code: `integrations.${client}.valid`,
          message: `All enabled owned ${label} Relay entries are valid.`,
          details: { records: records.length, enabled: enabled.length },
        };
      },
    };
  }

  function createGenericCheck(): DoctorCheck {
    return {
      id: 'integrations.generic-mcp',
      run: async () => {
        try {
          const path = join(input.integrationsDir, 'generic-mcp', 'server-config.json.example');
          await input.access(path, constants.R_OK);
          const parsed = JSON.parse(await input.readFile(path, 'utf8')) as unknown;
          if (!isGenericRelayEntry(parsed)) throw new Error('invalid template');
          return {
            status: 'skipped',
            code: 'integrations.generic-mcp.user-config-not-owned',
            message: 'Generic MCP user configuration is not owned by Relay and was not discovered.',
          };
        } catch {
          return {
            status: 'failure',
            code: 'integrations.generic-mcp.template-invalid',
            message: 'The packaged generic MCP integration template is missing or invalid.',
          };
        }
      },
    };
  }
}

function isGenericRelayEntry(
  value: unknown,
): value is { readonly command: 'relay'; readonly args: readonly ['mcp'] } {
  if (typeof value !== 'object' || value === null || Array.isArray(value)) return false;
  const record = value as Record<string, unknown>;
  return (
    Object.keys(record).length === 2 &&
    record.command === 'relay' &&
    Array.isArray(record.args) &&
    record.args.length === 1 &&
    record.args[0] === 'mcp'
  );
}
