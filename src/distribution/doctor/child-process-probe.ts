import { execFile, spawn, type ChildProcess } from 'node:child_process';

export const DOCTOR_MCP_TIMEOUT_MS = 5_000;
export const DOCTOR_UI_TIMEOUT_MS = 8_000;
export const DOCTOR_MAX_CAPTURE_BYTES = 32_768;

export interface ChildProcessProbeResult {
  readonly exitCode: number | null;
  readonly signal: NodeJS.Signals | null;
  readonly stdout: string;
  readonly stderr: string;
  readonly timedOut: boolean;
}

const activeChildren = new Set<ChildProcess>();
const activeCleanups = new Set<() => Promise<void> | void>();

export function registerDoctorCleanup(cleanup: () => Promise<void> | void): () => void {
  activeCleanups.add(cleanup);
  return () => activeCleanups.delete(cleanup);
}

export async function runChildProcessProbe(input: {
  readonly command: string;
  readonly args: readonly string[];
  readonly cwd: string;
  readonly env: NodeJS.ProcessEnv;
  readonly timeoutMs: number;
  readonly maxCaptureBytes: number;
  readonly onSpawn?: (child: ChildProcess) => void;
}): Promise<ChildProcessProbeResult> {
  const child = spawn(input.command, [...input.args], {
    cwd: input.cwd,
    env: input.env,
    detached: process.platform !== 'win32',
    windowsHide: true,
    stdio: ['ignore', 'pipe', 'pipe'],
  });
  activeChildren.add(child);
  const unregisterCleanup = registerDoctorCleanup(() => terminateChild(child));
  const stdout: Buffer[] = [];
  const stderr: Buffer[] = [];
  let stdoutBytes = 0;
  let stderrBytes = 0;
  let timedOut = false;

  const capture = (target: Buffer[], chunk: Buffer | string, current: number): number => {
    const remaining = Math.max(0, input.maxCaptureBytes - current);
    if (remaining > 0) target.push(Buffer.from(chunk).subarray(0, remaining));
    return current + Math.min(remaining, Buffer.byteLength(chunk));
  };
  child.stdout?.on('data', (chunk: Buffer | string) => {
    stdoutBytes = capture(stdout, chunk, stdoutBytes);
  });
  child.stderr?.on('data', (chunk: Buffer | string) => {
    stderrBytes = capture(stderr, chunk, stderrBytes);
  });

  let timeout: NodeJS.Timeout | undefined;
  try {
    input.onSpawn?.(child);
  } catch (error) {
    await terminateChild(child);
    activeChildren.delete(child);
    unregisterCleanup();
    throw error;
  }

  try {
    const result = await new Promise<ChildProcessProbeResult>((resolve, reject) => {
      let settled = false;
      const settle = (value: ChildProcessProbeResult): void => {
        if (settled) return;
        settled = true;
        activeChildren.delete(child);
        resolve(value);
      };
      child.once('error', (error) => {
        activeChildren.delete(child);
        if (!settled) {
          settled = true;
          reject(error);
        }
      });
      child.once('close', (exitCode, signal) => {
        settle({
          exitCode,
          signal,
          stdout: Buffer.concat(stdout).toString('utf8'),
          stderr: Buffer.concat(stderr).toString('utf8'),
          timedOut,
        });
      });
      timeout = setTimeout(() => {
        timedOut = true;
        void terminateChild(child).catch(() => undefined);
      }, input.timeoutMs);
    });
    return result;
  } finally {
    if (timeout !== undefined) clearTimeout(timeout);
    activeChildren.delete(child);
    unregisterCleanup();
  }
}

export async function cleanupDoctorChildren(): Promise<void> {
  await Promise.all([
    ...[...activeChildren].map((child) => terminateChild(child)),
    ...[...activeCleanups].map((cleanup) => Promise.resolve().then(cleanup)),
  ]);
}

export function installDoctorSignalHandlers(): () => void {
  const handler = (): void => {
    void cleanupDoctorChildren();
  };
  process.on('SIGINT', handler);
  process.on('SIGTERM', handler);
  return () => {
    process.off('SIGINT', handler);
    process.off('SIGTERM', handler);
  };
}

async function terminateChild(child: ChildProcess): Promise<void> {
  if (child.exitCode !== null || child.signalCode !== null || child.killed) return;
  const pid = child.pid;
  try {
    if (process.platform === 'win32' || pid === undefined) child.kill('SIGTERM');
    else process.kill(-pid, 'SIGTERM');
  } catch {
    try {
      child.kill('SIGTERM');
    } catch {
      return;
    }
  }
  const exited = await waitForExit(child, 500);
  if (process.platform === 'win32' && pid !== undefined) {
    await taskkill(pid);
    await waitForExit(child, 500);
    return;
  }
  if (exited) return;
  try {
    if (pid === undefined) {
      child.kill('SIGKILL');
    } else process.kill(-pid, 'SIGKILL');
  } catch {
    try {
      child.kill('SIGKILL');
    } catch {
      /* already exited */
    }
  }
  await waitForExit(child, 500);
}

function taskkill(pid: number): Promise<void> {
  return new Promise((resolve) => {
    execFile('taskkill', ['/PID', String(pid), '/T', '/F'], { windowsHide: true }, () => resolve());
  });
}

function waitForExit(child: ChildProcess, timeoutMs: number): Promise<boolean> {
  if (child.exitCode !== null || child.signalCode !== null) return Promise.resolve(true);
  return new Promise((resolve) => {
    const timer = setTimeout(() => {
      child.off('exit', onExit);
      resolve(false);
    }, timeoutMs);
    const onExit = (): void => {
      clearTimeout(timer);
      resolve(true);
    };
    child.once('exit', onExit);
  });
}
