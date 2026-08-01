import { readFileSync } from 'node:fs';
import { homedir } from 'node:os';
import { resolve } from 'node:path';
import { parse as parseToml } from '@iarna/toml';
import { describe, expect, it } from 'vitest';
import { z } from 'zod';

const distributionAdrPath = resolve('docs/decisions/0003-distribution-filesystem-and-lifecycle.md');
const agentIntegrationAdrPath = resolve('docs/decisions/0002-agent-integration-contracts.md');
const fixtureRoot = resolve('tests/fixtures/distribution');
const documentationRoot = resolve('docs/distribution');
const configExampleRoot = resolve('tests/fixtures/distribution/config-examples');

function readFixture(name: string): unknown {
  return JSON.parse(readFileSync(resolve(fixtureRoot, name), 'utf8')) as unknown;
}

function readDocumentation(name: string): string {
  return readFileSync(resolve(documentationRoot, name), 'utf8');
}

function readConfigExample(name: string): unknown {
  return JSON.parse(readFileSync(resolve(configExampleRoot, name), 'utf8')) as unknown;
}

function readTomlConfigExample(name: string): Record<string, unknown> {
  return parseToml(readFileSync(resolve(configExampleRoot, name), 'utf8')) as Record<
    string,
    unknown
  >;
}

describe('distribution ADR', () => {
  it('locks package, runtime, platform, path, lifecycle, and release decisions', () => {
    const adr = readFileSync(distributionAdrPath, 'utf8');
    for (const required of [
      '@krishna916/relay',
      '`relay`',
      'Node.js 24',
      'Windows x64',
      'macOS arm64',
      'Linux x64',
      'RELAY_DB_PATH',
      'Downgrades are unsupported',
      'Normal uninstall retains user data',
      'explicit maintainer-triggered release',
    ]) {
      expect(adr).toContain(required);
    }
    expect(adr).toContain('Status: Accepted');
    for (const unsupportedClaim of [
      /\|\s*Windows\s*\|\s*arm64\s*\|\s*Unsupported\s*\|/,
      /\|\s*macOS\s*\|\s*x64\s*\|\s*Unsupported\s*\|/,
      /\|\s*Linux\s*\|\s*arm64\s*\|\s*Unsupported\s*\|/,
      /\|\s*Alpine\/musl\s*\|\s*any\s*\|\s*Unsupported\s*\|/,
    ]) {
      expect(adr).toMatch(unsupportedClaim);
    }
    expect(adr).not.toMatch(/\|[^\n]*\bSupported\b[^\n]*(Windows|macOS|Linux)\s+(arm64|x64)/i);
  });

  it('keeps the distribution and agent-integration ADR identities unique', () => {
    expect(readFileSync(agentIntegrationAdrPath, 'utf8')).toContain('Agent Integration');
    expect(readFileSync(distributionAdrPath, 'utf8')).toContain(
      'Relay Distribution, Filesystem, and Lifecycle Contract',
    );
  });
});

describe('distribution fixtures', () => {
  it('contains the locked platform, path, command, ownership, and lifecycle values', () => {
    const platformSchema = z.object({
      nodeMajor: z.literal(24),
      supported: z.array(
        z.object({
          platform: z.enum(['win32', 'darwin', 'linux']),
          arch: z.enum(['x64', 'arm64']),
          libc: z.enum(['n/a', 'glibc']),
        }),
      ),
      unsupported: z.array(
        z.object({ platform: z.string(), arch: z.string(), reason: z.string() }),
      ),
      evidenceRequired: z.array(z.string()),
    });
    const pathSchema = z.object({
      databasePrecedence: z.array(z.string()),
      databaseEnvironmentOverrides: z.array(z.string()),
      rejectRelativeDatabaseOverride: z.literal(true),
      platforms: z.object({
        win32: z.object({
          dataRoot: z.string(),
          database: z.string(),
          configRoot: z.string(),
          metadata: z.string(),
          cacheRoot: z.string(),
          logs: z.string(),
        }),
        darwin: z.object({
          dataRoot: z.string(),
          database: z.string(),
          configRoot: z.string(),
          metadata: z.string(),
          cacheRoot: z.string(),
          logs: z.string(),
        }),
        linux: z.object({
          dataRoot: z.string(),
          database: z.string(),
          configRoot: z.string(),
          metadata: z.string(),
          cacheRoot: z.string(),
          logs: z.string(),
        }),
      }),
      logsEnabledByDefault: z.literal(false),
      assetBase: z.literal('installed-module-url'),
      cwdAffectsResolution: z.literal(false),
    });
    const commandSchema = z.object({
      commands: z.array(z.string()),
      taskCommandsUnchanged: z.literal(true),
      exitCodes: z.array(z.number()),
      jsonEnvelopeSchemaVersion: z.literal(1),
      mcpUsesJsonEnvelope: z.literal(false),
      mcpStdout: z.literal('protocol-only'),
      diagnosticsStream: z.literal('stderr'),
    });
    const ownershipSchema = z.object({
      ownedEntryName: z.literal('relay'),
      codexOwnedIdentifier: z.literal('mcp_servers.relay'),
      claudeCodeOwnedIdentifier: z.literal('mcpServers.relay'),
      installedCommand: z.literal('relay'),
      installedArgs: z.tuple([z.literal('mcp')]),
      configPathSelection: z.literal('explicit-absolute-path-only'),
      missingOrRelativePathExitCode: z.literal(2),
      conflictExitCode: z.literal(4),
      backupFilenamePattern: z.string(),
      mutateGenericByDefault: z.literal(false),
      ownershipMetadataFields: z.array(z.string()),
      preserveUnrelatedConfiguration: z.literal(true),
      inferOwnershipFromCommandName: z.literal(false),
    });
    const lifecycleSchema = z.object({
      normalUninstallRetainsData: z.literal(true),
      integrationRemovalRetainsData: z.literal(true),
      downgradeSupported: z.literal(false),
      destructiveDeleteSeparateAction: z.literal(true),
      automaticPublish: z.literal(false),
      releaseTrigger: z.literal('manual-maintainer-action'),
      disableRetains: z.array(z.string()),
      integrationRemovalRetains: z.array(z.string()),
      uninstallRetains: z.array(z.string()),
    });

    const platformFixture = platformSchema.parse(readFixture('supported-platforms.json'));
    const pathFixture = pathSchema.parse(readFixture('path-resolution.json'));
    const commandFixture = commandSchema.parse(readFixture('operational-commands.json'));
    const ownershipFixture = ownershipSchema.parse(readFixture('client-config-ownership.json'));
    const lifecycleFixture = lifecycleSchema.parse(readFixture('lifecycle-policy.json'));

    expect(platformFixture.supported).toEqual([
      { platform: 'win32', arch: 'x64', libc: 'n/a' },
      { platform: 'darwin', arch: 'arm64', libc: 'n/a' },
      { platform: 'linux', arch: 'x64', libc: 'glibc' },
    ]);
    expect(platformFixture.unsupported).toEqual([
      { platform: 'win32', arch: 'arm64', reason: 'No release claim.' },
      { platform: 'darwin', arch: 'x64', reason: 'No release claim.' },
      { platform: 'linux', arch: 'arm64', reason: 'No release claim.' },
      {
        platform: 'linux-musl',
        arch: 'any',
        reason: 'better-sqlite3 compatibility is not claimed.',
      },
    ]);
    expect(commandFixture.commands).toEqual(['setup', 'mcp', 'ui', 'doctor', 'config']);
    expect(commandFixture.exitCodes).toEqual([0, 1, 2, 3, 4, 5]);
    expect(pathFixture.databaseEnvironmentOverrides).toEqual(['RELAY_DB_PATH']);
    expect(ownershipFixture.ownedEntryName).toBe('relay');
    expect(ownershipFixture.codexOwnedIdentifier).toBe('mcp_servers.relay');
    expect(ownershipFixture.claudeCodeOwnedIdentifier).toBe('mcpServers.relay');
    expect(ownershipFixture.installedCommand).toBe('relay');
    expect(ownershipFixture.installedArgs).toEqual(['mcp']);
    expect(ownershipFixture.configPathSelection).toBe('explicit-absolute-path-only');
    expect(ownershipFixture.missingOrRelativePathExitCode).toBe(2);
    expect(ownershipFixture.conflictExitCode).toBe(4);
    expect(lifecycleFixture.normalUninstallRetainsData).toBe(true);
    expect(lifecycleFixture.downgradeSupported).toBe(false);
    expect(lifecycleFixture.disableRetains).toEqual([
      'package',
      'database',
      'metadata',
      'cache',
      'backups',
    ]);
    expect(lifecycleFixture.integrationRemovalRetains).toEqual([
      'package',
      'metadata',
      'database',
      'cache',
      'backups',
      'user-data',
    ]);
    expect(lifecycleFixture.uninstallRetains).toEqual([
      'database',
      'config',
      'cache',
      'backups',
      'user-data',
    ]);

    const serializedFixtures = JSON.stringify([
      platformFixture,
      pathFixture,
      commandFixture,
      ownershipFixture,
      lifecycleFixture,
    ]);
    expect(serializedFixtures).not.toContain(process.cwd());
    expect(serializedFixtures).not.toContain(homedir());
  });
});

describe('distribution documentation', () => {
  it('derives operational, filesystem, and platform guidance from ADR 0003', () => {
    const adr = readFileSync(distributionAdrPath, 'utf8');
    const operational = readDocumentation('operational-cli-contract.md');
    const filesystem = readDocumentation('filesystem-contract.md');
    const platforms = readDocumentation('supported-platforms.md');
    const adrLink = '../decisions/0003-distribution-filesystem-and-lifecycle.md';

    for (const document of [operational, filesystem, platforms]) {
      expect(document).toContain(adrLink);
    }
    for (const command of ['setup', 'mcp', 'ui', 'doctor', 'config']) {
      expect(operational).toContain(`relay ${command}`);
    }
    expect(operational).toContain('task and session commands remain unchanged');
    expect(filesystem).toContain('RELAY_DB_PATH');
    expect(filesystem).toContain('explicit in-process');
    expect(filesystem).toContain('import.meta.url');
    expect(adr).toContain('Directory casing is platform-specific');
    expect(adr).toContain('Windows and macOS use `Relay`; Linux uses lowercase `relay`');
    expect(adr).not.toContain('Directory names are lowercase ' + '`relay`, except');
    for (const pathValue of [
      '%LOCALAPPDATA%\\Relay\\relay.db',
      '~/Library/Application Support/Relay/relay.db',
      '${XDG_DATA_HOME:-~/.local/share}/relay/relay.db',
    ]) {
      expect(filesystem).toContain(pathValue);
    }
    expect(platforms).toContain('Unsupported Claims');
    expect(platforms).toContain('Evidence Required Before Release');
    expect(platforms).toContain('does not justify compatibility with every Linux distribution');
  });
});

describe('distribution ownership and lifecycle', () => {
  it('preserves unrelated configuration and refuses unowned conflicts', () => {
    const codexBefore = readTomlConfigExample('codex-before.toml');
    const codexAfter = readTomlConfigExample('codex-after.toml');
    const codexConflict = readTomlConfigExample('codex-conflict.toml');
    const claudeBefore = readConfigExample('claude-code-before.json') as {
      projectSetting: string;
      mcpServers: Record<string, unknown>;
    };
    const claudeAfter = readConfigExample('claude-code-after.json') as {
      projectSetting: string;
      mcpServers: Record<string, unknown>;
    };
    const claudeConflict = readConfigExample('claude-code-conflict.json') as {
      mcpServers: Record<string, { command: string; args: string[] }>;
    };

    expect(codexAfter).toMatchObject({
      mcp_servers: { relay: { command: 'relay', args: ['mcp'] } },
    });
    expect(codexAfter.model).toBe(codexBefore.model);
    expect(codexAfter.mcp_servers).toMatchObject({
      unrelated: (codexBefore.mcp_servers as Record<string, unknown>).unrelated,
    });
    expect(codexConflict).toMatchObject({
      mcp_servers: { relay: { command: 'other-relay-wrapper', args: ['serve'] } },
    });
    expect(claudeAfter.projectSetting).toBe(claudeBefore.projectSetting);
    expect(claudeAfter.mcpServers.unrelated).toEqual(claudeBefore.mcpServers.unrelated);
    expect(claudeAfter).toMatchObject({
      mcpServers: { relay: { command: 'relay', args: ['mcp'] } },
    });
    expect(claudeConflict.mcpServers.relay).toEqual({
      command: 'other-relay-wrapper',
      args: ['serve'],
    });
  });

  it('documents ownership, backup, lifecycle, and retention rules', () => {
    const adr = readFileSync(distributionAdrPath, 'utf8');
    const ownership = readDocumentation('setup-and-config-ownership.md');
    const operational = readDocumentation('operational-cli-contract.md');
    const lifecycle = readDocumentation('upgrade-removal-and-retention.md');
    for (const required of [
      'explicit absolute client configuration path',
      'does not auto-discover client configuration files',
      '`mcp_servers.relay`',
      '`mcpServers.relay`',
      '`command = "relay"`',
      '`"command": "relay"`',
      '`args = ["mcp"]`',
      '`"args": ["mcp"]`',
      'existing `env` values are preserved but are not Relay-owned',
    ]) {
      expect(`${adr}\n${ownership}\n${operational}`).toContain(required);
    }
    expect(ownership).not.toContain('maps this ' + 'abstract subtree');
    expect(ownership).not.toContain('then-current ' + 'official');
    for (const section of [
      'Ownership Boundary',
      'Relay Metadata',
      'Idempotent Setup Algorithm',
      'Backup and Atomic Write Contract',
      'Codex Entry Contract',
      'Claude Code Entry Contract',
      'Generic MCP Fragment Contract',
      'Conflict Handling',
      'Exact Change Reporting',
      'Secret Redaction',
    ]) {
      expect(ownership).toContain(`## ${section}`);
    }
    for (const step of [
      'resolve and validate the supported platform',
      'resolve Relay paths without creating files',
      'load Relay ownership metadata if present',
      'locate the selected client configuration',
      'parse the configuration',
      'classify the desired entry',
      'compute a change plan',
      'return no-change without writes',
      'create a backup before mutation',
      'write a temporary sibling and validate it',
      'atomically replace the original',
      'persist ownership metadata only after success',
      'print an exact redacted change report',
    ]) {
      expect(ownership).toContain(step);
    }
    for (const section of [
      'Upgrade',
      'Database Migration Failure',
      'Downgrade',
      'Disable',
      'Integration Removal',
      'Package Uninstall',
      'Explicit Data Deletion',
      'Backup Retention',
      'Recovery Guidance',
      'Retention Matrix',
    ]) {
      expect(lifecycle).toContain(`## ${section}`);
    }
    expect(lifecycle).toContain('normal uninstall retains user data');
    expect(lifecycle).toContain('Downgrades are unsupported');
  });
});

describe('distribution compatibility and release policy', () => {
  it('locks one application version and a maintainer-triggered release', () => {
    const compatibilitySchema = z.object({
      applicationVersionSource: z.literal('package.json'),
      versionedAssets: z.array(
        z.enum(['cli', 'mcp', 'ui', 'migrations', 'skills', 'integrations']),
      ),
      payloadSchemaVersionIndependent: z.literal(true),
      downgradeSupported: z.literal(false),
      releaseTrigger: z.literal('manual-maintainer-action'),
    });
    const compatibility = compatibilitySchema.parse(readFixture('version-compatibility.json'));
    expect(compatibility.versionedAssets).toEqual([
      'cli',
      'mcp',
      'ui',
      'migrations',
      'skills',
      'integrations',
    ]);

    const release = readDocumentation('release-policy.md');
    expect(release).toContain('no publish-on-push');
    expect(release).toContain('no publish-on-merge');
    expect(release).toContain('Required Platform Evidence');
    expect(release).toContain('Windows x64');
    expect(release).toContain('macOS arm64');
    expect(release).toContain('glibc-compatible Linux x64');
  });
});

describe('distribution discoverability', () => {
  it('links the contract without presenting publication as available', () => {
    const readme = readFileSync(resolve('README.md'), 'utf8');
    const sourceGuide = readFileSync(resolve('docs/source-checkout-guide.md'), 'utf8');
    const checklist = readFileSync(
      resolve('docs/manual-verification/distribution-contract-review.md'),
      'utf8',
    );

    expect(readme).toContain('docs/decisions/0003-distribution-filesystem-and-lifecycle.md');
    expect(readme).toContain('docs/distribution/');
    expect(sourceGuide).toContain(
      'npm installation is not available until the later packaging and publication issues are completed',
    );
    for (const reviewPoint of [
      'Package identity',
      'only Windows x64, macOS arm64, and glibc-compatible Linux x64',
      'never depend on `cwd`',
      'unowned or conflicting `relay` entry',
      'required sibling backup',
      'retain the database and backups',
      'Downgrade after a newer migration state',
      'one application version',
      'explicit maintainer approval',
      'No production packaging',
    ]) {
      expect(checklist).toContain(reviewPoint);
    }
  });
});
