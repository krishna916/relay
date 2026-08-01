import { cp, mkdir, readdir, rm } from 'node:fs/promises';
import { existsSync } from 'node:fs';
import { join, resolve } from 'node:path';
import { pathToFileURL } from 'node:url';

export interface StagePackageAssetsOptions {
  readonly rootDir?: string;
}

async function copyMigrations(rootDir: string): Promise<void> {
  const sourceDir = join(rootDir, 'src', 'database', 'migrations');
  const destinationDir = join(rootDir, 'assets', 'migrations');
  if (!existsSync(sourceDir)) throw new Error(`Package asset source is missing: ${sourceDir}`);
  const entries = (await readdir(sourceDir, { withFileTypes: true }))
    .filter((entry) => entry.isFile() && entry.name.endsWith('.sql'))
    .sort((left, right) => left.name.localeCompare(right.name));
  if (entries.length === 0) throw new Error('Package staging requires at least one SQL migration.');
  await rm(destinationDir, { recursive: true, force: true });
  await mkdir(destinationDir, { recursive: true });
  for (const entry of entries)
    await cp(join(sourceDir, entry.name), join(destinationDir, entry.name));
}

export async function stagePackageAssets(options: StagePackageAssetsOptions = {}): Promise<void> {
  const rootDir = resolve(options.rootDir ?? process.cwd());
  await copyMigrations(rootDir);
  for (const required of [
    'dist/web/index.html',
    'skills/relay-capture/SKILL.md',
    'integrations/generic-mcp/README.md',
  ]) {
    if (!existsSync(join(rootDir, required)))
      throw new Error(`Package asset is missing after build: ${join(rootDir, required)}`);
  }
}

if (import.meta.url === pathToFileURL(process.argv[1] ?? '').href) {
  stagePackageAssets()
    .then(() => process.stdout.write('Relay package assets staged.\n'))
    .catch((error: unknown) => {
      process.stderr.write(`${error instanceof Error ? error.message : String(error)}\n`);
      process.exitCode = 1;
    });
}
