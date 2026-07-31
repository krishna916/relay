import { cp, mkdir, readdir, rm, writeFile } from 'node:fs/promises';
import { existsSync, readFileSync } from 'node:fs';
import { spawn } from 'node:child_process';
import { dirname, join, resolve } from 'node:path';
import { pathToFileURL } from 'node:url';
import {
  assertLinuxBuildTarget,
  assertRuntimeDependencyParity,
  createStagedManifest,
  createStagedRuntimePackage,
  readLockedRuntimeDependencies,
  readRelayPackageMetadata,
  resolveLinuxMcpbPaths,
  type LinuxMcpbPaths,
  type McpbManifest,
  type RuntimePackage,
} from './model.js';

export interface CommandOptions {
  readonly cwd: string;
  readonly env?: NodeJS.ProcessEnv;
}
export type CommandRunner = (
  command: string,
  args: readonly string[],
  options: CommandOptions,
) => Promise<void>;
export interface StageLinuxMcpbOptions {
  readonly rootDir?: string;
  readonly platform?: NodeJS.Platform;
  readonly arch?: NodeJS.Architecture;
  readonly runCommand?: CommandRunner;
}

const sourceAssets = [
  'manifest.json',
  'package.json',
  'pnpm-lock.yaml',
  '.mcpbignore',
  'NOTICE.md',
];
const prohibitedNames = new Set(['.env', '.git', '.github', 'coverage', 'tests']);

function json<T>(path: string): T {
  return JSON.parse(requireText(path)) as T;
}
function requireText(path: string): string {
  if (!existsSync(path)) throw new Error(`MCPB required source path is missing: ${path}`);
  return readFileSync(path, 'utf8');
}

export const spawnCommand: CommandRunner = (command, args, options) =>
  new Promise((resolvePromise, reject) => {
    const child = spawn(command, args, {
      cwd: options.cwd,
      env: options.env,
      shell: false,
      stdio: 'inherit',
    });
    child.once('error', reject);
    child.once('exit', (code) => {
      if (code === 0) resolvePromise();
      else
        reject(
          new Error(`MCPB command failed: ${command} ${args.join(' ')} (exit ${String(code)}).`),
        );
    });
  });

async function copyFile(source: string, destination: string): Promise<void> {
  await mkdir(dirname(destination), { recursive: true });
  await cp(source, destination);
}

async function copyMigrations(sourceDir: string, destinationDir: string): Promise<void> {
  const migrations = (await readdir(sourceDir)).filter((entry) => entry.endsWith('.sql'));
  if (migrations.length === 0) throw new Error('MCPB staging requires at least one SQL migration.');
  await Promise.all(
    migrations.map((migration) =>
      copyFile(join(sourceDir, migration), join(destinationDir, migration)),
    ),
  );
}

async function copyMcpRuntimeChunks(distDir: string, stageDir: string): Promise<void> {
  const chunks = (await readdir(distDir, { withFileTypes: true })).filter(
    (entry) => entry.isFile() && entry.name.startsWith('chunk-') && entry.name.endsWith('.js'),
  );
  await Promise.all(
    chunks.map((chunk) => copyFile(join(distDir, chunk.name), join(stageDir, chunk.name))),
  );
}

async function assertSafeStageInventory(stageDir: string): Promise<void> {
  const visit = async (directory: string): Promise<void> => {
    for (const entry of await readdir(directory, { withFileTypes: true })) {
      if (entry.name === 'node_modules') continue;
      if (prohibitedNames.has(entry.name) || /\.(?:db|db-wal|db-shm|log|map)$/i.test(entry.name)) {
        throw new Error(`MCPB source inventory contains prohibited path: ${entry.name}`);
      }
      if (entry.isDirectory()) await visit(join(directory, entry.name));
    }
  };
  await visit(stageDir);
}

export async function stageLinuxMcpb(options: StageLinuxMcpbOptions = {}): Promise<LinuxMcpbPaths> {
  const rootDir = resolve(options.rootDir ?? process.cwd());
  assertLinuxBuildTarget(options.platform);
  const relay = readRelayPackageMetadata(rootDir);
  const paths = resolveLinuxMcpbPaths(rootDir, options.arch, relay.version);
  const rootPackage = readLockedRuntimeDependencies(rootDir);
  const sourceManifest = json<McpbManifest>(join(paths.sourceDir, 'manifest.json'));
  const sourcePackage = json<RuntimePackage>(join(paths.sourceDir, 'package.json'));
  assertRuntimeDependencyParity(rootPackage, sourcePackage);

  const builtEntry = join(rootDir, 'dist', 'mcp', 'main.js');
  const migrationsDir = join(rootDir, 'src', 'database', 'migrations');
  requireText(builtEntry);
  for (const asset of sourceAssets) requireText(join(paths.sourceDir, asset));
  if (!existsSync(migrationsDir))
    throw new Error(`MCPB required source path is missing: ${migrationsDir}`);

  await rm(paths.stageDir, { recursive: true, force: true });
  await Promise.all([
    mkdir(join(paths.stageDir, 'server'), { recursive: true }),
    mkdir(join(paths.stageDir, 'src/database/migrations'), { recursive: true }),
  ]);
  await Promise.all([
    writeFile(
      join(paths.stageDir, 'manifest.json'),
      `${JSON.stringify(createStagedManifest(sourceManifest, relay), null, 2)}\n`,
    ),
    writeFile(
      join(paths.stageDir, 'package.json'),
      `${JSON.stringify(createStagedRuntimePackage(sourcePackage, relay), null, 2)}\n`,
    ),
    copyFile(join(paths.sourceDir, 'pnpm-lock.yaml'), join(paths.stageDir, 'pnpm-lock.yaml')),
    copyFile(join(paths.sourceDir, '.mcpbignore'), join(paths.stageDir, '.mcpbignore')),
    copyFile(join(paths.sourceDir, 'NOTICE.md'), join(paths.stageDir, 'NOTICE.md')),
    copyFile(builtEntry, join(paths.stageDir, 'server', 'main.js')),
    copyMcpRuntimeChunks(join(rootDir, 'dist'), paths.stageDir),
    copyMigrations(migrationsDir, join(paths.stageDir, 'src/database/migrations')),
  ]);
  await (options.runCommand ?? spawnCommand)(
    'pnpm',
    [
      'install',
      '--prod',
      '--frozen-lockfile',
      '--ignore-workspace',
      '--config.node-linker=hoisted',
    ],
    {
      cwd: paths.stageDir,
    },
  );
  await assertSafeStageInventory(paths.stageDir);
  return paths;
}

if (import.meta.url === pathToFileURL(process.argv[1] ?? '').href) {
  stageLinuxMcpb()
    .then((paths) => process.stdout.write(`Linux MCPB staged at ${paths.stageDir}\n`))
    .catch((error: unknown) => {
      process.stderr.write(`${error instanceof Error ? error.message : String(error)}\n`);
      process.exitCode = 1;
    });
}
