import { describe, expect, it } from 'vitest';
import { mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import { createCompatibilityCheck } from '../../../../src/distribution/doctor/check-compatibility.js';

function fixture(): string {
  const root = mkdtempSync(join(tmpdir(), 'relay-doctor-compat-'));
  mkdirSync(join(root, 'assets', 'migrations'), { recursive: true });
  mkdirSync(join(root, 'skills', 'relay-capture'), { recursive: true });
  mkdirSync(join(root, 'integrations', 'generic-mcp'), { recursive: true });
  writeFileSync(
    join(root, 'assets', 'migrations', '0001_example.sql'),
    'CREATE TABLE example (id INTEGER);',
  );
  writeFileSync(
    join(root, 'skills', 'relay-capture', 'SKILL.md'),
    '---\nname: relay-capture\ndescription: Use when testing.\n---\n',
  );
  writeFileSync(
    join(root, 'integrations', 'generic-mcp', 'server-config.json.example'),
    JSON.stringify({ command: 'relay', args: ['mcp'] }),
  );
  writeFileSync(
    join(root, 'assets', 'compatibility.json'),
    JSON.stringify({
      schemaVersion: 1,
      minimumPackageVersion: '0.1.0',
      mcpContractSchemaVersion: 1,
      migrationManifestVersion: 1,
      migrationCount: 1,
      skillMetadataVersion: 1,
      integrationTemplateVersion: 1,
    }),
  );
  return root;
}

describe('doctor compatibility check', () => {
  it('accepts the current machine-readable compatibility manifest', async () => {
    const root = fixture();
    try {
      await expect(
        createCompatibilityCheck({
          applicationVersion: '0.1.0',
          compatibilityManifestPath: join(root, 'assets', 'compatibility.json'),
          migrationsDir: join(root, 'assets', 'migrations'),
          skillsDir: join(root, 'skills'),
          integrationsDir: join(root, 'integrations'),
        }).run(),
      ).resolves.toMatchObject({ status: 'healthy', code: 'compatibility.assets.current' });
    } finally {
      rmSync(root, { recursive: true, force: true });
    }
  });

  it('fails a malformed or newer compatibility manifest safely', async () => {
    const root = fixture();
    try {
      writeFileSync(
        join(root, 'assets', 'compatibility.json'),
        JSON.stringify({ schemaVersion: 99, secret: 'hidden' }),
      );
      const result = await createCompatibilityCheck({
        applicationVersion: '0.1.0',
        compatibilityManifestPath: join(root, 'assets', 'compatibility.json'),
        migrationsDir: join(root, 'assets', 'migrations'),
        skillsDir: join(root, 'skills'),
        integrationsDir: join(root, 'integrations'),
      }).run();
      expect(result).toMatchObject({ status: 'failure', code: 'compatibility.assets.invalid' });
      expect(JSON.stringify(result)).not.toContain('hidden');
    } finally {
      rmSync(root, { recursive: true, force: true });
    }
  });

  it('rejects an application version below the manifest minimum', async () => {
    const root = fixture();
    try {
      const manifestPath = join(root, 'assets', 'compatibility.json');
      const manifest = JSON.parse(readFileSync(manifestPath, 'utf8')) as Record<string, unknown>;
      manifest.minimumPackageVersion = '0.2.0';
      writeFileSync(manifestPath, JSON.stringify(manifest));
      const result = await createCompatibilityCheck({
        applicationVersion: '0.1.0',
        compatibilityManifestPath: manifestPath,
        migrationsDir: join(root, 'assets', 'migrations'),
        skillsDir: join(root, 'skills'),
        integrationsDir: join(root, 'integrations'),
      }).run();
      expect(result).toMatchObject({ status: 'failure', code: 'compatibility.assets.invalid' });
    } finally {
      rmSync(root, { recursive: true, force: true });
    }
  });

  it('rejects a migration count mismatch', async () => {
    const root = fixture();
    try {
      writeFileSync(
        join(root, 'assets', 'migrations', '0002_extra.sql'),
        'CREATE TABLE extra (id INTEGER);',
      );
      const result = await createCompatibilityCheck({
        applicationVersion: '0.1.0',
        compatibilityManifestPath: join(root, 'assets', 'compatibility.json'),
        migrationsDir: join(root, 'assets', 'migrations'),
        skillsDir: join(root, 'skills'),
        integrationsDir: join(root, 'integrations'),
      }).run();
      expect(result).toMatchObject({ status: 'failure', code: 'compatibility.assets.invalid' });
    } finally {
      rmSync(root, { recursive: true, force: true });
    }
  });
});
