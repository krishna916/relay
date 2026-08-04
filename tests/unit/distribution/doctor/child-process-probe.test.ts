import { describe, expect, it } from 'vitest';
import { join } from 'node:path';
import { kill } from 'node:process';
import {
  DOCTOR_MAX_CAPTURE_BYTES,
  DOCTOR_MCP_TIMEOUT_MS,
  DOCTOR_UI_TIMEOUT_MS,
  runChildProcessProbe,
} from '../../../../src/distribution/doctor/child-process-probe.js';

const fixtureDir = join(process.cwd(), 'tests', 'fixtures', 'doctor', 'process');

describe('doctor child process probe', () => {
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
      timeoutMs: 50,
      maxCaptureBytes: 4,
    });
    expect(result.timedOut).toBe(true);
    expect(result.stdout.length).toBeLessThanOrEqual(4);
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
