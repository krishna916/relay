import { join } from 'node:path';
import { createRequire } from 'node:module';
import { pathToFileURL } from 'node:url';
import { access, mkdtemp, readFile, realpath, rm, stat } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import type Database from 'better-sqlite3';
import { resolveRuntimePaths, type RuntimePaths } from '../distribution/resolve-runtime-paths.js';
import { resolvePackageAssets } from '../distribution/package-assets.js';
import { readPackageVersion } from '../distribution/package-version.js';
import { createOwnershipStore } from '../distribution/setup/ownership-store.js';
import type { OperationalDependencies } from './cli/run-operational-command.js';
import type { DoctorCommandDependencies } from './cli/run-doctor-command.js';
import {
  createRuntimePlatformCheck,
  createRuntimeVersionCheck,
} from '../distribution/doctor/check-runtime.js';
import { createPackageAssetsCheck } from '../distribution/doctor/check-package-assets.js';
import {
  createPathAccessCheck,
  createPathResolutionCheck,
} from '../distribution/doctor/check-paths.js';
import {
  createDatabaseIntegrityCheck,
  createDatabaseStateCheck,
  createNativeAddonCheck,
} from '../distribution/doctor/check-database.js';
import { createIntegrationChecks } from '../distribution/doctor/check-integrations.js';
import { createCompatibilityCheck } from '../distribution/doctor/check-compatibility.js';
import {
  createMcpHandshakeCheck,
  resolveInstalledRelayCommand,
} from '../distribution/doctor/check-mcp.js';
import { createUiLoopbackCheck } from '../distribution/doctor/check-ui.js';
import { createClaudeJsonAdapter } from '../distribution/setup/clients/claude-json-adapter.js';
import { createCodexTomlAdapter } from '../distribution/setup/clients/codex-toml-adapter.js';

const require = createRequire(import.meta.url);

export async function runMcpServer(): Promise<number | void> {
  return (await import('./mcp/main.js')).runMcpServer();
}

export async function runUiServer(): Promise<number | void> {
  return (await import('./http/main.js')).runUiServer();
}

export function resolveOwnershipMetadataPath(runtimePaths: RuntimePaths): string {
  return join(runtimePaths.configRoot, 'config.json');
}

export function createOperationalDependencies(
  output: {
    stdout: { write(text: string): unknown };
    stderr: { write(text: string): unknown };
  },
  createRuntime: OperationalDependencies['openRuntime'],
): OperationalDependencies {
  const runtimePaths = resolveRuntimePaths();
  const applicationVersion = readPackageVersion();
  return {
    runtimePaths,
    applicationVersion,
    openRuntime: createRuntime,
    ownershipStore: createOwnershipStore({
      metadataPath: resolveOwnershipMetadataPath(runtimePaths),
      applicationVersion,
    }),
    stdout: output.stdout,
    stderr: output.stderr,
    now: () => new Date(),
  };
}

export function createDoctorDependencies(output: {
  stdout: { write(text: string): unknown };
  stderr: { write(text: string): unknown };
}): DoctorCommandDependencies {
  const assets = resolvePackageAssets(
    process.argv[1] === undefined ? import.meta.url : pathToFileURL(process.argv[1]).href,
  );
  const runtimePaths = resolveRuntimePaths();
  const applicationVersion = readPackageVersion(assets);
  const metadataPath = resolveOwnershipMetadataPath(runtimePaths);
  const ownershipStore = createOwnershipStore({ metadataPath, applicationVersion });
  const openReadOnly = (databasePath: string): Database.Database => {
    const SqliteDatabase = require('better-sqlite3') as typeof Database;
    return new SqliteDatabase(databasePath, { readonly: true, fileMustExist: true });
  };
  const openNativeProbe = (): Database.Database => {
    const SqliteDatabase = require('better-sqlite3') as typeof Database;
    return new SqliteDatabase(':memory:');
  };
  const temporaryRootFactory = async (): Promise<{ path: string; cleanup(): Promise<void> }> => {
    const path = await mkdtemp(join(tmpdir(), '.relay-doctor-'));
    return {
      path,
      cleanup: async () => {
        await rm(path, { recursive: true, force: true });
      },
    };
  };
  const installedCommand = resolveInstalledRelayCommand({
    execPath: process.execPath,
    argv1: process.argv[1] ?? '',
  });
  return {
    applicationVersion,
    createChecks: () => {
      const [codex, claude, generic] = createIntegrationChecks({
        ownershipStore,
        adapters: { codex: createCodexTomlAdapter(), 'claude-code': createClaudeJsonAdapter() },
        integrationsDir: assets.integrationsDir,
        readFile,
        access,
      });
      return [
        createRuntimeVersionCheck({ nodeVersion: process.versions.node, expectedMajor: 24 }),
        createRuntimePlatformCheck({
          platform: process.platform,
          arch: process.arch,
          report: readRuntimeReport(),
        }),
        createPackageAssetsCheck({
          executablePath: process.argv[1] ?? '',
          assets,
          access,
          realpath,
        }),
        createPathResolutionCheck({ runtimePaths, metadataPath }),
        createPathAccessCheck({ runtimePaths, metadataPath, access, stat }),
        createDatabaseStateCheck({
          databasePath: runtimePaths.databasePath,
          migrationsDir: assets.migrationsDir,
          openReadOnly,
        }),
        createDatabaseIntegrityCheck({ databasePath: runtimePaths.databasePath, openReadOnly }),
        createNativeAddonCheck({
          openProbe: openNativeProbe,
          nodeAbi: process.versions.modules,
          packageVersion: applicationVersion,
        }),
        codex,
        claude,
        generic,
        createCompatibilityCheck({
          applicationVersion,
          compatibilityManifestPath: join(assets.packageRoot, 'assets', 'compatibility.json'),
          migrationsDir: assets.migrationsDir,
          skillsDir: assets.skillsDir,
          integrationsDir: assets.integrationsDir,
        }),
        createMcpHandshakeCheck({ installedCommand, temporaryRootFactory }),
        createUiLoopbackCheck({ installedCommand, temporaryRootFactory, fetch: globalThis.fetch }),
      ];
    },
    now: () => new Date(),
    monotonicNow: () => performance.now(),
    stdout: output.stdout,
    stderr: output.stderr,
  };
}

function readRuntimeReport(): { readonly glibc?: string } {
  if (process.platform !== 'linux' || process.report === undefined) return {};
  try {
    const report = process.report.getReport() as {
      readonly header?: { readonly glibcVersionRuntime?: unknown };
    };
    const glibc = report.header?.glibcVersionRuntime;
    return typeof glibc === 'string' ? { glibc } : {};
  } catch {
    return {};
  }
}
