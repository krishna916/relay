import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { loadMigrationManifest } from '../../database/migration.js';
import { CONTRACT_SCHEMA_VERSION } from '../../interfaces/contracts/contract-version.js';
import type { DoctorCheck } from './doctor-types.js';

interface CompatibilityManifest {
  readonly schemaVersion: 1;
  readonly minimumPackageVersion: string;
  readonly mcpContractSchemaVersion: number;
  readonly migrationManifestVersion: number;
  readonly migrationCount: number;
  readonly skillMetadataVersion: number;
  readonly integrationTemplateVersion: number;
}

export function createCompatibilityCheck(input: {
  readonly applicationVersion: string;
  readonly migrationsDir: string;
  readonly skillsDir: string;
  readonly integrationsDir: string;
}): DoctorCheck {
  return {
    id: 'compatibility.assets',
    run: async () => {
      try {
        const manifest = JSON.parse(
          readFileSync(join(dirname(input.migrationsDir), 'compatibility.json'), 'utf8'),
        ) as CompatibilityManifest;
        if (!isManifest(manifest)) throw new Error('invalid manifest');
        const migrations = loadMigrationManifest(input.migrationsDir);
        const skill = readFileSync(join(input.skillsDir, 'relay-capture', 'SKILL.md'), 'utf8');
        const template = JSON.parse(
          readFileSync(
            join(input.integrationsDir, 'generic-mcp', 'server-config.json.example'),
            'utf8',
          ),
        ) as unknown;
        if (
          !atLeast(input.applicationVersion, manifest.minimumPackageVersion) ||
          manifest.mcpContractSchemaVersion !== CONTRACT_SCHEMA_VERSION ||
          manifest.migrationManifestVersion !== 1 ||
          manifest.migrationCount !== migrations.length ||
          !hasSkillMetadata(skill, manifest.skillMetadataVersion) ||
          !hasTemplateMetadata(template, manifest.integrationTemplateVersion)
        )
          throw new Error('incompatible assets');
        return {
          status: 'healthy',
          code: 'compatibility.assets.current',
          message: 'Relay package, contracts, migrations, skills, and templates are compatible.',
          details: { schemaVersion: manifest.schemaVersion, migrationCount: migrations.length },
        };
      } catch {
        return {
          status: 'failure',
          code: 'compatibility.assets.invalid',
          message:
            'Relay package assets have a missing, malformed, or incompatible version contract.',
        };
      }
    },
  };
}

function isManifest(value: unknown): value is CompatibilityManifest {
  if (typeof value !== 'object' || value === null || Array.isArray(value)) return false;
  const record = value as Record<string, unknown>;
  return (
    record.schemaVersion === 1 &&
    typeof record.minimumPackageVersion === 'string' &&
    typeof record.mcpContractSchemaVersion === 'number' &&
    typeof record.migrationManifestVersion === 'number' &&
    typeof record.migrationCount === 'number' &&
    typeof record.skillMetadataVersion === 'number' &&
    typeof record.integrationTemplateVersion === 'number'
  );
}

function hasSkillMetadata(content: string, version: number): boolean {
  return (
    version === 1 && /^---\r?\nname: [^\r\n]+\r?\ndescription: [^\r\n]+\r?\n---\r?\n/.test(content)
  );
}

function hasTemplateMetadata(value: unknown, version: number): boolean {
  if (version !== 1 || typeof value !== 'object' || value === null || Array.isArray(value))
    return false;
  const record = value as Record<string, unknown>;
  return (
    Object.keys(record).length === 2 &&
    record.command === 'relay' &&
    JSON.stringify(record.args) === '["mcp"]'
  );
}

function atLeast(actual: string, minimum: string): boolean {
  const actualParts = actual.split('.').map(Number);
  const minimumParts = minimum.split('.').map(Number);
  for (let index = 0; index < 3; index += 1) {
    const left = actualParts[index] ?? 0;
    const right = minimumParts[index] ?? 0;
    if (left !== right) return left > right;
  }
  return true;
}
