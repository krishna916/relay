import { execFile, spawn, type ChildProcess } from 'node:child_process';
import { DoctorInterruptedError, type DoctorTerminationSignal } from './doctor-interruption.js';

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

interface RegisteredCleanup {
  readonly cleanup: () => Promise<void> | void;
  readonly kind: 'child' | 'temporary-root';
  started: boolean;
  promise: Promise<void> | undefined;
}

export interface DoctorTemporaryRoot {
  readonly path: string;
  cleanup(): Promise<void>;
}

export interface DoctorSignalRegistration {
  readonly getSignal: () => DoctorTerminationSignal | undefined;
  readonly cleanupStarted: () => Promise<void>;
  readonly remove: () => void;
}

interface DoctorSignalTarget {
  on(signal: DoctorTerminationSignal, listener: () => void): unknown;
  off(signal: DoctorTerminationSignal, listener: () => void): unknown;
}

const activeChildren = new Set<ChildProcess>();
const activeCleanups = new Set<RegisteredCleanup>();
const childTerminationPromises = new WeakMap<ChildProcess, Promise<void>>();

export function registerDoctorCleanup(cleanup: () => Promise<void> | void): () => void {
  const entry = createRegisteredCleanup(cleanup, 'child');
  return () => unregisterCleanup(entry);
}

export function registerDoctorTemporaryRoot(root: DoctorTemporaryRoot): {
  readonly cleanup: () => Promise<void>;
} {
  const entry = createRegisteredCleanup(root.cleanup, 'temporary-root');
  return { cleanup: () => runRegisteredCleanup(entry) };
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
  const entries = [...activeCleanups];
  await Promise.allSettled(
    entries.filter((entry) => entry.kind === 'child').map((entry) => runRegisteredCleanup(entry)),
  );
  await Promise.allSettled(
    entries
      .filter((entry) => entry.kind === 'temporary-root')
      .map((entry) => runRegisteredCleanup(entry)),
  );
}

export function installDoctorSignalHandlers(input: {
  readonly controller: AbortController;
  readonly signalTarget?: DoctorSignalTarget;
}): DoctorSignalRegistration {
  let receivedSignal: DoctorTerminationSignal | undefined;
  let signalCleanup: Promise<void> | undefined;
  const signalTarget = input.signalTarget ?? process;
  const handleSignal = (signal: DoctorTerminationSignal): void => {
    if (receivedSignal !== undefined) return;
    receivedSignal = signal;
    input.controller.abort(new DoctorInterruptedError(signal));
    signalCleanup = cleanupDoctorChildren();
  };

  const onInterrupt = (): void => handleSignal('SIGINT');
  const onTerminate = (): void => handleSignal('SIGTERM');
  signalTarget.on('SIGINT', onInterrupt);
  signalTarget.on('SIGTERM', onTerminate);

  let removed = false;
  return {
    getSignal: () => receivedSignal,
    cleanupStarted: () => signalCleanup ?? Promise.resolve(),
    remove: () => {
      if (removed) return;
      removed = true;
      signalTarget.off('SIGINT', onInterrupt);
      signalTarget.off('SIGTERM', onTerminate);
    },
  };
}

function createRegisteredCleanup(
  cleanup: () => Promise<void> | void,
  kind: RegisteredCleanup['kind'],
): RegisteredCleanup {
  const entry: RegisteredCleanup = {
    cleanup,
    kind,
    started: false,
    promise: undefined,
  };
  activeCleanups.add(entry);
  return entry;
}

function unregisterCleanup(entry: RegisteredCleanup): void {
  if (!entry.started) activeCleanups.delete(entry);
}

function runRegisteredCleanup(entry: RegisteredCleanup): Promise<void> {
  if (entry.promise !== undefined) return entry.promise;
  entry.started = true;
  entry.promise = Promise.resolve()
    .then(entry.cleanup)
    .then(
      () => {
        activeCleanups.delete(entry);
      },
      (error: unknown) => {
        entry.promise = undefined;
        entry.started = false;
        throw error;
      },
    );
  return entry.promise;
}

function terminateChild(child: ChildProcess): Promise<void> {
  const existing = childTerminationPromises.get(child);
  if (existing !== undefined) return existing;
  const promise = terminateChildInternal(child).finally(() => {
    childTerminationPromises.delete(child);
  });
  childTerminationPromises.set(child, promise);
  return promise;
}

async function terminateChildInternal(child: ChildProcess): Promise<void> {
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
