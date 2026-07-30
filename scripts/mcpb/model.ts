import { readFileSync } from 'node:fs';
import { join, resolve } from 'node:path';

const runtimeDependencies = ['@modelcontextprotocol/sdk', 'better-sqlite3', 'zod'] as const;
const supportedArchitectures = ['x64', 'arm64'] as const;

export interface RelayPackageMetadata {
  readonly name: string;
  readonly version: string;
  readonly nodeEngine: string;
}

export interface LinuxMcpbPaths {
  readonly sourceDir: string;
  readonly stageDir: string;
  readonly artifactsDir: string;
  readonly artifactPath: string;
}

export interface McpbManifest {
  readonly manifest_version: string;
  readonly name: string;
  readonly version: string;
  readonly server: {
    readonly type: string;
    readonly entry_point: string;
    readonly mcp_config: {
      readonly command: string;
      readonly args: readonly string[];
      readonly env: Readonly<Record<string, string>>;
    };
  };
  readonly compatibility?: {
    readonly platforms?: readonly string[];
    readonly runtimes?: Readonly<Record<string, string>>;
  };
  readonly [key: string]: unknown;
}

export interface RuntimePackage {
  readonly name: string;
  readonly version: string;
  readonly type: string;
  readonly engines: { readonly node: string };
  readonly dependencies: Readonly<Record<string, string>>;
  readonly [key: string]: unknown;
}

export interface RootPackage {
  readonly dependencies: Readonly<Record<string, string>>;
}

function parseJson<T>(path: string): T {
  return JSON.parse(readFileSync(path, 'utf8')) as T;
}

export function readRelayPackageMetadata(rootDir: string): RelayPackageMetadata {
  const packageJson = parseJson<{
    name?: string;
    version?: string;
    engines?: { node?: string };
  }>(join(resolve(rootDir), 'package.json'));
  if (packageJson.name !== 'relay') {
    throw new Error(
      `MCPB packaging requires root package name relay; received ${String(packageJson.name)}.`,
    );
  }
  if (!packageJson.version || !packageJson.engines?.node) {
    throw new Error('MCPB packaging requires a root version and Node engine.');
  }
  return {
    name: packageJson.name,
    version: packageJson.version,
    nodeEngine: packageJson.engines.node,
  };
}

export function resolveLinuxMcpbPaths(
  rootDir: string,
  arch: NodeJS.Architecture = process.arch,
  version = readRelayPackageMetadata(rootDir).version,
): LinuxMcpbPaths {
  if (!supportedArchitectures.includes(arch as (typeof supportedArchitectures)[number])) {
    throw new Error(
      `Unsupported Linux MCPB architecture: ${arch}. Supported architectures: x64, arm64.`,
    );
  }
  const resolvedRoot = resolve(rootDir);
  const sourceDir = join(resolvedRoot, 'integrations', 'claude-desktop');
  const stageDir = join(resolvedRoot, '.mcpb', 'relay');
  const artifactsDir = join(resolvedRoot, 'artifacts');
  return {
    sourceDir,
    stageDir,
    artifactsDir,
    artifactPath: join(artifactsDir, `relay-${version}-linux-${arch}.mcpb`),
  };
}

export function assertLinuxBuildTarget(platform: NodeJS.Platform = process.platform): void {
  if (platform !== 'linux') {
    throw new Error(
      `Linux MCPB construction requires process.platform === "linux".\nCurrent platform: ${platform}.\nRun this command on a supported Linux environment.`,
    );
  }
}

export function createStagedManifest(
  source: McpbManifest,
  relay: RelayPackageMetadata,
): McpbManifest {
  return {
    ...source,
    name: relay.name,
    version: relay.version,
    compatibility: { platforms: ['linux'], runtimes: { node: relay.nodeEngine } },
  };
}

export function createStagedRuntimePackage(
  source: RuntimePackage,
  relay: RelayPackageMetadata,
): RuntimePackage {
  return {
    ...source,
    name: relay.name,
    version: relay.version,
    engines: { node: relay.nodeEngine },
    dependencies: { ...source.dependencies },
  };
}

function resolvedVersion(version: string): string {
  return version.replace(/^[~^]/, '');
}

export function assertRuntimeDependencyParity(
  rootPackage: RootPackage,
  runtimePackage: RuntimePackage,
): void {
  for (const forbidden of ['react', 'react-dom']) {
    if (runtimePackage.dependencies[forbidden]) {
      throw new Error(`MCPB runtime package must not include React dependency ${forbidden}.`);
    }
  }
  for (const dependency of runtimeDependencies) {
    const rootVersion = rootPackage.dependencies[dependency];
    const runtimeVersion = runtimePackage.dependencies[dependency];
    if (
      !rootVersion ||
      !runtimeVersion ||
      resolvedVersion(rootVersion) !== resolvedVersion(runtimeVersion)
    ) {
      throw new Error(
        `MCPB runtime dependency ${dependency} must match the root resolved version ${resolvedVersion(rootVersion ?? 'missing')}.`,
      );
    }
  }
  const extras = Object.keys(runtimePackage.dependencies).filter(
    (dependency) =>
      !runtimeDependencies.includes(dependency as (typeof runtimeDependencies)[number]),
  );
  if (extras.length > 0) {
    throw new Error(`MCPB runtime package contains unsupported dependency: ${extras[0]}.`);
  }
}
