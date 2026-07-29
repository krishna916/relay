import { mkdir, mkdtemp, rm } from 'node:fs/promises';
import { dirname, isAbsolute, relative, resolve, join } from 'node:path';
import { fileURLToPath } from 'node:url';

export interface AgentTestRuntimeOptions {
  readonly environment?: NodeJS.ProcessEnv;
}

export interface AgentTestRuntime {
  readonly checkoutPath: string;
  readonly databasePath: string;
  createWorkingDirectory(name: string): Promise<string>;
  environment(overrides?: NodeJS.ProcessEnv): NodeJS.ProcessEnv;
  close(): Promise<void>;
}

const checkoutPath = resolve(dirname(fileURLToPath(import.meta.url)), '../..');

export async function createAgentTestRuntime(
  options: AgentTestRuntimeOptions = {},
): Promise<AgentTestRuntime> {
  const root = await mkdtemp(join(checkoutPath, 'tmp', 'relay-agent-verification-'));
  const dataDirectory = join(root, 'data');
  const workingDirectoryRoot = join(root, 'cwd');
  await Promise.all([mkdir(dataDirectory), mkdir(workingDirectoryRoot)]);

  const databasePath = join(dataDirectory, 'relay.db');
  let closed = false;

  return {
    checkoutPath,
    databasePath,
    async createWorkingDirectory(name: string): Promise<string> {
      const workingDirectory = resolve(workingDirectoryRoot, name);
      const escape = relative(workingDirectoryRoot, workingDirectory);
      if (escape.startsWith('..') || isAbsolute(escape)) {
        throw new Error(`Working directory escapes the disposable root: ${name}`);
      }
      await mkdir(workingDirectory, { recursive: true });
      return workingDirectory;
    },
    environment(overrides: NodeJS.ProcessEnv = {}): NodeJS.ProcessEnv {
      return {
        ...process.env,
        ...options.environment,
        ...overrides,
        RELAY_DB_PATH: databasePath,
      };
    },
    async close(): Promise<void> {
      if (closed) return;
      closed = true;
      await rm(root, { recursive: true, force: true });
    },
  };
}
