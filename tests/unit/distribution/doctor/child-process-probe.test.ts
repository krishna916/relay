import { describe, expect, it } from 'vitest';
import { join } from 'node:path';
import { kill } from 'node:process';
import {
  cleanupDoctorChildren,
  DOCTOR_MAX_CAPTURE_BYTES,
  DOCTOR_MCP_TIMEOUT_MS,
  DOCTOR_UI_TIMEOUT_MS,
  installDoctorSignalHandlers,
  registerDoctorCleanup,
  registerDoctorTemporaryRoot,
  runChildProcessProbe,
} from '../../../../src/distribution/doctor/child-process-probe.js';
import { DoctorInterruptedError } from '../../../../src/distribution/doctor/doctor-interruption.js';

const fixtureDir = join(process.cwd(), 'tests', 'fixtures', 'doctor', 'process');

describe('doctor child process probe', () => {
  it('aborts once, awaits cleanup, and keeps the first signal', async () => {
    const listeners = new Map<string, () => void>();
    const target = {
      on: (signal: 'SIGINT' | 'SIGTERM', listener: () => void) => listeners.set(signal, listener),
      off: (signal: 'SIGINT' | 'SIGTERM', listener: () => void) => {
        if (listeners.get(signal) === listener) listeners.delete(signal);
      },
    };
    let releaseCleanup!: () => void;
    const cleanupFinished = new Promise<void>((resolve) => {
      releaseCleanup = resolve;
    });
    let cleanupCalls = 0;
    registerDoctorCleanup(async () => {
      cleanupCalls += 1;
      await cleanupFinished;
    });
    const controller = new AbortController();
    const registration = installDoctorSignalHandlers({ controller, signalTarget: target });

    listeners.get('SIGINT')?.();
    listeners.get('SIGTERM')?.();

    expect(registration.getSignal()).toBe('SIGINT');
    expect(controller.signal.reason).toBeInstanceOf(DoctorInterruptedError);
    expect((controller.signal.reason as DoctorInterruptedError).signal).toBe('SIGINT');
    await Promise.resolve();
    expect(cleanupCalls).toBe(1);
    let cleanupResolved = false;
    void registration.cleanupStarted().then(() => {
      cleanupResolved = true;
    });
    await Promise.resolve();
    expect(cleanupResolved).toBe(false);
    releaseCleanup();
    await registration.cleanupStarted();
    expect(cleanupResolved).toBe(true);

    registration.remove();
    expect(listeners.size).toBe(0);
    registration.remove();
    await cleanupDoctorChildren();
  });

  it('runs a temporary-root cleanup once across signal and local cleanup', async () => {
    let releaseCleanup!: () => void;
    const cleanupFinished = new Promise<void>((resolve) => {
      releaseCleanup = resolve;
    });
    let cleanupCalls = 0;
    const root = registerDoctorTemporaryRoot({
      path: 'test-root',
      cleanup: async () => {
        cleanupCalls += 1;
        await cleanupFinished;
      },
    });
    const signalCleanup = cleanupDoctorChildren();
    const localCleanup = root.cleanup();
    releaseCleanup();
    await Promise.all([signalCleanup, localCleanup]);

    expect(cleanupCalls).toBe(1);
    await cleanupDoctorChildren();
  });

  it('stops child cleanup before removing a temporary root and retries failures', async () => {
    let childStopped = false;
    let rootCleanupCalls = 0;
    registerDoctorCleanup(() => {
      childStopped = true;
    });
    registerDoctorTemporaryRoot({
      path: 'test-root',
      cleanup: async () => {
        rootCleanupCalls += 1;
        if (!childStopped && rootCleanupCalls === 1) throw new Error('root still in use');
      },
    });

    await cleanupDoctorChildren();

    expect(childStopped).toBe(true);
    expect(rootCleanupCalls).toBe(1);

    await cleanupDoctorChildren();
    expect(rootCleanupCalls).toBe(1);

    let retryCalls = 0;
    let failFirst = true;
    registerDoctorTemporaryRoot({
      path: 'retry-root',
      cleanup: async () => {
        retryCalls += 1;
        if (failFirst) {
          failFirst = false;
          throw new Error('transient root cleanup failure');
        }
      },
    });
    await cleanupDoctorChildren();
    await cleanupDoctorChildren();
    expect(retryCalls).toBe(2);
  });

  it('captures a healthy child and exposes the locked timeout constants', async () => {
    const result = await runChildProcessProbe({
      command: process.execPath,
      args: [join(fixtureDir, 'healthy-child.mjs')],
      cwd: process.cwd(),
      env: process.env,
      timeoutMs: DOCTOR_MCP_TIMEOUT_MS,
      maxCaptureBytes: DOCTOR_MAX_CAPTURE_BYTES,
    });
    expect(result).toMatchObject({
      exitCode: 0,
      signal: null,
      timedOut: false,
      stdout: 'healthy-output',
      stderr: 'healthy-diagnostic',
    });
    expect(DOCTOR_UI_TIMEOUT_MS).toBe(8_000);
  });

  it('terminates a hanging child on timeout and bounds capture', async () => {
    const result = await runChildProcessProbe({
      command: process.execPath,
      args: [join(fixtureDir, 'hanging-child.mjs')],
      cwd: process.cwd(),
      env: process.env,
      timeoutMs: 1_000,
      maxCaptureBytes: 4,
    });
    expect(result.timedOut).toBe(true);
    expect(result.stdout).toBe('hang');
  });

  it('cleans up when the spawn callback throws', async () => {
    await expect(
      runChildProcessProbe({
        command: process.execPath,
        args: [join(fixtureDir, 'hanging-child.mjs')],
        cwd: process.cwd(),
        env: process.env,
        timeoutMs: 2_000,
        maxCaptureBytes: 32,
        onSpawn: () => {
          throw new Error('parser failure');
        },
      }),
    ).rejects.toThrow('parser failure');
  });

  it('terminates a spawned grandchild with the timed-out parent', async () => {
    const result = await runChildProcessProbe({
      command: process.execPath,
      args: [join(fixtureDir, 'spawn-grandchild.mjs')],
      cwd: process.cwd(),
      env: process.env,
      timeoutMs: 100,
      maxCaptureBytes: 128,
    });
    const childPid = Number(result.stdout);
    expect(Number.isInteger(childPid)).toBe(true);
    expect(childPid).toBeGreaterThan(0);
    expect(result.timedOut).toBe(true);
    await expect(waitForProcessExit(childPid)).resolves.toBe(true);
  });
});

async function waitForProcessExit(pid: number): Promise<boolean> {
  const deadline = Date.now() + 2_000;
  while (Date.now() < deadline) {
    try {
      kill(pid, 0);
    } catch {
      return true;
    }
    await new Promise((resolve) => setTimeout(resolve, 50));
  }
  return false;
}
