import { execFileSync, spawn, spawnSync } from 'node:child_process';
import { existsSync, mkdirSync, mkdtempSync, readFileSync, rmSync } from 'node:fs';
import { createServer } from 'node:net';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { pathToFileURL } from 'node:url';
import { Client } from '@modelcontextprotocol/sdk/client/index.js';
import { StdioClientTransport } from '@modelcontextprotocol/sdk/client/stdio.js';
import { inspectTarball } from './inspect-tarball.js';

interface CliRun {
  readonly status: number | null;
  readonly stdout: string;
  readonly stderr: string;
}

function npmCommand(): string {
  return process.platform === 'win32' ? 'npm.cmd' : 'npm';
}
function pnpmCommand(): string {
  return process.platform === 'win32' ? 'pnpm.cmd' : 'pnpm';
}

function runPnpmBuild(rootDir: string): void {
  if (process.platform === 'win32') {
    execFileSync(process.env.ComSpec ?? 'cmd.exe', ['/d', '/s', '/c', 'pnpm build'], {
      cwd: rootDir,
      stdio: 'pipe',
    });
  } else {
    execFileSync(pnpmCommand(), ['build'], { cwd: rootDir, stdio: 'pipe' });
  }
}

function runNpm(
  args: readonly string[],
  cwd: string,
  encoding?: BufferEncoding,
  npmCache?: string,
): string {
  const env = npmCache === undefined ? process.env : { ...process.env, npm_config_cache: npmCache };
  if (process.platform === 'win32') {
    const command = `npm ${args
      .map((arg) => (/[\s"]/.test(arg) ? `"${arg.replaceAll('"', '\\"')}"` : arg))
      .join(' ')}`;
    return execFileSync(process.env.ComSpec ?? 'cmd.exe', ['/d', '/s', '/c', command], {
      cwd,
      encoding: encoding ?? 'buffer',
      stdio: encoding ? ['ignore', 'pipe', 'inherit'] : 'inherit',
      env,
    }) as string;
  }
  return execFileSync(npmCommand(), args, { cwd, encoding: encoding ?? 'buffer', env }) as string;
}

export function readExpectedPackageVersion(rootDir: string): string {
  const packagePath = join(rootDir, 'package.json');
  const parsed = JSON.parse(readFileSync(packagePath, 'utf8')) as {
    readonly name?: string;
    readonly version?: string;
  };

  if (parsed.name !== '@krishna916/relay') {
    throw new Error(`Package smoke expected @krishna916/relay metadata at ${packagePath}.`);
  }
  if (!/^(?:0|[1-9]\d*)\.(?:0|[1-9]\d*)\.(?:0|[1-9]\d*)$/.test(parsed.version ?? '')) {
    throw new Error(`Package smoke found an invalid version in ${packagePath}.`);
  }

  return parsed.version!;
}

function pack(rootDir: string, artifactDir: string): string {
  runPnpmBuild(rootDir);
  const result = JSON.parse(
    runNpm(
      ['pack', '--json', '--pack-destination', artifactDir],
      rootDir,
      'utf8',
      join(artifactDir, 'npm-cache'),
    ),
  ) as Array<{ filename: string }>;
  const filename = result[0]?.filename;
  if (!filename) throw new Error('npm pack did not return a tarball filename.');
  return join(artifactDir, filename);
}

function runCli(
  commandPath: string,
  cwd: string,
  databasePath: string,
  args: readonly string[],
): CliRun {
  const result =
    process.platform === 'win32'
      ? spawnSync(
          process.env.ComSpec ?? 'cmd.exe',
          [
            '/d',
            '/s',
            '/c',
            [commandPath, ...args].map((arg) => (/\s/.test(arg) ? `"${arg}"` : arg)).join(' '),
          ],
          { cwd, env: { ...process.env, RELAY_DB_PATH: databasePath }, encoding: 'utf8' },
        )
      : spawnSync(commandPath, args, {
          cwd,
          env: { ...process.env, RELAY_DB_PATH: databasePath },
          encoding: 'utf8',
        });
  return { status: result.status, stdout: result.stdout ?? '', stderr: result.stderr ?? '' };
}

interface CliEnvelope {
  readonly data?: {
    readonly task?: { readonly id?: string };
    readonly change?: { readonly to?: string };
  };
}

function envelope(run: CliRun): CliEnvelope {
  if (run.stdout.trim().split(/\r?\n/).filter(Boolean).length !== 1)
    throw new Error(`Installed CLI was not JSON-clean: ${run.stdout}`);
  return JSON.parse(run.stdout) as CliEnvelope;
}

function findFreePort(): Promise<number> {
  return new Promise((resolve, reject) => {
    const server = createServer();
    server.once('error', reject);
    server.listen(0, '127.0.0.1', () => {
      const address = server.address();
      const port = typeof address === 'object' && address ? address.port : undefined;
      server.close((error) =>
        error
          ? reject(error)
          : port
            ? resolve(port)
            : reject(new Error('Could not allocate a port.')),
      );
    });
  });
}

async function waitForHttp(url: string): Promise<void> {
  for (let attempt = 0; attempt < 50; attempt += 1) {
    try {
      const response = await fetch(`${url}/api/health`);
      if (response.ok) return;
    } catch {
      /* startup race */
    }
    await new Promise((resolve) => setTimeout(resolve, 100));
  }
  throw new Error(`Installed UI did not become ready at ${url}.`);
}

async function verifyMcp(
  commandPath: string,
  installedMain: string,
  cwd: string,
  databasePath: string,
  taskId: string,
  expectedVersion: string,
): Promise<void> {
  const command = process.platform === 'win32' ? process.execPath : commandPath;
  const args = process.platform === 'win32' ? [installedMain, 'mcp'] : ['mcp'];
  const transport = new StdioClientTransport({
    command,
    args,
    cwd,
    env: { ...process.env, RELAY_DB_PATH: databasePath },
    stderr: 'pipe',
  });
  const client = new Client({ name: 'relay-installed-package-smoke', version: '1.0.0' });
  try {
    await Promise.race([
      client.connect(transport),
      new Promise<never>((_, reject) =>
        setTimeout(() => reject(new Error('Installed MCP handshake timed out.')), 15_000),
      ),
    ]);
    const health = (await client.callTool({ name: 'relay_health', arguments: {} })) as {
      content?: Array<{ text?: string }>;
    };
    const parsed = JSON.parse(health.content?.[0]?.text ?? '{}') as {
      version?: string;
      status?: string;
    };
    if (parsed.status !== 'ok' || parsed.version !== expectedVersion)
      throw new Error(
        `Installed MCP health reported version ${String(parsed.version)}; expected ${expectedVersion}.`,
      );
    const task = (await client.callTool({ name: 'task_get', arguments: { taskId } })) as {
      structuredContent?: { data?: { task?: { id?: string } } };
    };
    if (task.structuredContent?.data?.task?.id !== taskId)
      throw new Error('Installed MCP did not observe the CLI-created task.');
  } finally {
    await transport.close().catch(() => undefined);
  }
}

export async function verifyInstalledPackage(rootDir = process.cwd()): Promise<void> {
  const expectedVersion = readExpectedPackageVersion(rootDir);
  const temporaryRoot = mkdtempSync(join(tmpdir(), 'relay-installed-package-'));
  const prefix = join(temporaryRoot, 'prefix');
  const unrelatedCwd = join(temporaryRoot, 'unrelated-cwd');
  const databasePath = join(temporaryRoot, 'data', 'relay.db');
  const artifactDir = join(temporaryRoot, 'artifacts');
  mkdirSync(unrelatedCwd, { recursive: true });
  mkdirSync(artifactDir, { recursive: true });
  const tarballPath = pack(rootDir, artifactDir);
  try {
    runNpm(
      ['install', '--global', '--prefix', prefix, tarballPath],
      unrelatedCwd,
      undefined,
      join(artifactDir, 'npm-cache'),
    );
    const commandPath =
      process.platform === 'win32' ? join(prefix, 'relay.cmd') : join(prefix, 'bin', 'relay');
    const installedMain = join(
      prefix,
      'node_modules',
      '@krishna916',
      'relay',
      'dist',
      'cli',
      'main.js',
    );
    if (!existsSync(commandPath))
      throw new Error(`Installed Relay executable is missing: ${commandPath}`);
    if (commandPath.includes(rootDir))
      throw new Error('Installed smoke resolved the repository executable.');

    const capture = runCli(commandPath, unrelatedCwd, databasePath, [
      'task',
      'capture',
      '--title',
      'Installed-Relay-task',
      '--agent',
      'Smoke',
      '--session',
      'installed-session',
      '--workspace',
      'package',
      '--source-context',
      'tarball',
      '--output',
      'json',
    ]);
    if (capture.status !== 0 || capture.stderr !== '')
      throw new Error(`Installed capture failed: ${capture.stderr}`);
    const taskId = envelope(capture).data?.task?.id;
    if (!taskId) throw new Error('Installed capture did not return a task id.');
    for (const args of [
      ['task', 'list', '--output', 'json'],
      ['task', 'get', taskId, '--output', 'json'],
      ['task', 'find-similar', '--title', 'Installed-Relay-task', '--output', 'json'],
      ['session', 'captures', '--session', 'installed-session', '--output', 'json'],
    ]) {
      const result = runCli(commandPath, unrelatedCwd, databasePath, args);
      if (result.status !== 0)
        throw new Error(`Installed command failed (${args.join(' ')}): ${result.stderr}`);
      envelope(result);
    }
    const triage = runCli(commandPath, unrelatedCwd, databasePath, [
      'task',
      'triage',
      taskId,
      '--to',
      'ACTIVE',
      '--output',
      'json',
    ]);
    if (triage.status !== 0 || envelope(triage).data?.change?.to !== 'ACTIVE')
      throw new Error('Installed lifecycle mutation did not persist.');
    const invalid = runCli(commandPath, unrelatedCwd, databasePath, [
      'task',
      'list',
      '--output',
      'json',
    ]);
    if (invalid.status !== 0) throw new Error('Installed SQLite database could not be reopened.');
    await verifyMcp(commandPath, installedMain, unrelatedCwd, databasePath, taskId, expectedVersion);

    const port = await findFreePort();
    const ui =
      process.platform === 'win32'
        ? spawn(process.execPath, [installedMain, 'ui'], {
            cwd: unrelatedCwd,
            env: { ...process.env, RELAY_DB_PATH: databasePath, RELAY_HTTP_PORT: String(port) },
            stdio: ['ignore', 'pipe', 'pipe'],
          })
        : spawn(commandPath, ['ui'], {
            cwd: unrelatedCwd,
            env: { ...process.env, RELAY_DB_PATH: databasePath, RELAY_HTTP_PORT: String(port) },
            stdio: ['ignore', 'pipe', 'pipe'],
          });
    let stderr = '';
    ui.stderr.on('data', (chunk: Buffer | string) => {
      stderr += chunk.toString();
    });
    const url = `http://127.0.0.1:${port}`;
    try {
      await waitForHttp(url);
      const health = (await (await fetch(`${url}/api/health`)).json()) as { version?: string };
      const tasks = (await (await fetch(`${url}/api/tasks`)).json()) as {
        tasks?: Array<{ id?: string }>;
      };
      const index = await (await fetch(`${url}/`)).text();
      if (
        health.version !== expectedVersion ||
        !tasks.tasks?.some((task) => task.id === taskId) ||
        !index.includes('<!doctype html>')
      )
        throw new Error(
          `Installed UI health reported version ${String(health.version)}; expected ${expectedVersion}, or it did not serve the shared task database and packaged assets.`,
        );
    } finally {
      ui.kill();
      if (ui.exitCode === null)
        await new Promise<void>((resolve) => ui.once('exit', () => resolve()));
    }
    if (!stderr.includes(url))
      throw new Error(`Installed UI did not report its loopback URL: ${stderr}`);
    await inspectTarball(tarballPath);
  } finally {
    rmSync(temporaryRoot, { recursive: true, force: true });
  }
}

if (import.meta.url === pathToFileURL(process.argv[1] ?? '').href) {
  verifyInstalledPackage()
    .then(() => process.stdout.write('Installed Relay package smoke passed.\n'))
    .catch((error: unknown) => {
      process.stderr.write(`${error instanceof Error ? error.message : String(error)}\n`);
      process.exitCode = 1;
    });
}
