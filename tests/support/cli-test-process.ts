import { spawn } from 'node:child_process';
import { join } from 'node:path';
import type { AgentTestRuntime } from './agent-test-runtime.js';

export interface CliProcessOptions {
  readonly cwd?: string;
  readonly environment?: NodeJS.ProcessEnv;
  readonly timeoutMs?: number;
}

export interface CliProcessResult {
  readonly exitCode: number;
  readonly stdout: string;
  readonly stderr: string;
  readonly json: unknown;
}

export function runRelayCli(
  runtime: AgentTestRuntime,
  args: readonly string[],
  options: CliProcessOptions = {},
): Promise<CliProcessResult> {
  const command = join(runtime.checkoutPath, 'dist', 'cli', 'main.js');
  const child = spawn(process.execPath, [command, ...args], {
    cwd: options.cwd ?? runtime.checkoutPath,
    env: runtime.environment(options.environment),
    shell: false,
    stdio: ['ignore', 'pipe', 'pipe'],
  });

  let stdout = '';
  let stderr = '';
  child.stdout.on('data', (chunk: Buffer | string) => {
    stdout += chunk.toString();
  });
  child.stderr.on('data', (chunk: Buffer | string) => {
    stderr += chunk.toString();
  });

  return new Promise<CliProcessResult>((resolve, reject) => {
    let settled = false;
    const timeout = setTimeout(() => {
      settled = true;
      child.kill();
      reject(new Error(`Relay CLI timed out after ${options.timeoutMs ?? 30_000}ms.`));
    }, options.timeoutMs ?? 30_000);
    child.once('error', (error) => {
      if (settled) return;
      settled = true;
      clearTimeout(timeout);
      reject(error);
    });
    child.once('close', (code) => {
      if (settled) return;
      settled = true;
      clearTimeout(timeout);
      try {
        resolve({
          exitCode: code ?? 1,
          stdout,
          stderr,
          json: parseSingleJson(stdout),
        });
      } catch (error) {
        reject(error);
      }
    });
  });
}

function parseSingleJson(stdout: string): unknown {
  const trimmed = stdout.trim();
  if (trimmed.length === 0) throw new Error('Relay CLI produced no JSON output.');
  return JSON.parse(trimmed) as unknown;
}
