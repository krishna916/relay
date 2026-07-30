import { mkdir, readFile, rm, stat } from 'node:fs/promises';
import { existsSync } from 'node:fs';
import { resolve } from 'node:path';
import { pathToFileURL } from 'node:url';
import {
  assertLinuxBuildTarget,
  readRelayPackageMetadata,
  resolveLinuxMcpbPaths,
  type LinuxMcpbPaths,
} from './model.js';
import { spawnCommand, type CommandRunner } from './stage-linux-mcpb.js';

export function createPackCommands(
  paths: LinuxMcpbPaths,
): readonly { readonly command: string; readonly args: readonly string[] }[] {
  return [
    { command: 'mcpb', args: ['validate', paths.stageDir] },
    { command: 'mcpb', args: ['pack', paths.stageDir, paths.artifactPath] },
    { command: 'mcpb', args: ['info', paths.artifactPath] },
  ];
}
export async function packLinuxMcpb(
  options: { readonly rootDir?: string; readonly runCommand?: CommandRunner } = {},
): Promise<LinuxMcpbPaths> {
  assertLinuxBuildTarget();
  const rootDir = resolve(options.rootDir ?? process.cwd());
  const paths = resolveLinuxMcpbPaths(
    rootDir,
    process.arch,
    readRelayPackageMetadata(rootDir).version,
  );
  if (!existsSync(paths.stageDir))
    throw new Error(`Linux MCPB stage is missing: ${paths.stageDir}`);
  await mkdir(paths.artifactsDir, { recursive: true });
  await rm(paths.artifactPath, { force: true });
  const runCommand = options.runCommand ?? spawnCommand;
  for (const command of createPackCommands(paths))
    await runCommand(command.command, command.args, { cwd: rootDir });
  const bytes = await readFile(paths.artifactPath);
  if (bytes.length < 4 || bytes[0] !== 0x50 || bytes[1] !== 0x4b)
    throw new Error('Linux MCPB artifact is not a ZIP file.');
  const details = await stat(paths.artifactPath);
  process.stdout.write(`Linux MCPB artifact: ${paths.artifactPath} (${details.size} bytes)\n`);
  return paths;
}
if (import.meta.url === pathToFileURL(process.argv[1] ?? '').href)
  packLinuxMcpb().catch((error: unknown) => {
    process.stderr.write(`${error instanceof Error ? error.message : String(error)}\n`);
    process.exitCode = 1;
  });
