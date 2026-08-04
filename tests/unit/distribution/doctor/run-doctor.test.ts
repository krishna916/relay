import { describe, expect, it } from 'vitest';
import {
  DOCTOR_CHECK_ORDER,
  type DoctorCheck,
  type DoctorCheckId,
} from '../../../../src/distribution/doctor/doctor-types.js';
import { DoctorInterruptedError } from '../../../../src/distribution/doctor/doctor-interruption.js';
import { runDoctor } from '../../../../src/distribution/doctor/run-doctor.js';

const generatedAt = new Date('2026-08-04T12:00:00.000Z');

function checksFor(
  results: readonly { status: 'healthy' | 'warning' | 'failure' | 'skipped'; message: string }[],
): readonly DoctorCheck[] {
  return DOCTOR_CHECK_ORDER.map((id, index) => ({
    id,
    run: async () => ({
      status: results[index]?.status ?? 'healthy',
      code: `${id}.ok`,
      message: results[index]?.message ?? 'No issue detected.',
    }),
  }));
}

describe('runDoctor', () => {
  it('runs ordered checks once and builds deterministic counts and durations', async () => {
    let tick = 100;
    const results = DOCTOR_CHECK_ORDER.map((_, index) => ({
      status: (['healthy', 'warning', 'failure', 'skipped'] as const)[index % 4]!,
      message: `result-${index}`,
    }));
    const calls: DoctorCheckId[] = [];
    const checks = checksFor(results).map((check) => ({
      id: check.id,
      run: async () => {
        calls.push(check.id);
        return check.run();
      },
    }));

    const report = await runDoctor({
      context: {
        applicationVersion: '0.1.0',
        now: () => generatedAt,
        monotonicNow: () => (tick += 2),
      },
      checks,
    });

    expect(calls).toEqual([...DOCTOR_CHECK_ORDER]);
    expect(report.schemaVersion).toBe(1);
    expect(report.relayVersion).toBe('0.1.0');
    expect(report.generatedAt).toBe(generatedAt.toISOString());
    expect(report.checks.map((check) => check.id)).toEqual([...DOCTOR_CHECK_ORDER]);
    expect(report.checks.every((check) => check.durationMs === 2)).toBe(true);
    expect(report.summary).toEqual({ healthy: 4, warning: 4, failure: 3, skipped: 3 });
  });

  it('sanitizes thrown check errors without exposing the original error', async () => {
    const checks = checksFor(
      DOCTOR_CHECK_ORDER.map(() => ({ status: 'healthy' as const, message: 'ok' })),
    ).map((check, index) => ({
      id: check.id,
      run:
        index === 6
          ? async () => {
              throw new Error('secret SQL and stack details');
            }
          : check.run,
    }));

    const report = await runDoctor({
      context: {
        applicationVersion: '0.1.0',
        now: () => generatedAt,
        monotonicNow: () => 1,
      },
      checks,
    });

    expect(report.checks[6]).toMatchObject({
      id: DOCTOR_CHECK_ORDER[6],
      status: 'failure',
      code: `${DOCTOR_CHECK_ORDER[6]}.internal-error`,
      message: 'The diagnostic check could not be completed safely.',
      durationMs: 0,
    });
    expect(JSON.stringify(report)).not.toContain('secret SQL');
  });

  it('rejects when the controller is already aborted before the first check', async () => {
    const controller = new AbortController();
    controller.abort(new DoctorInterruptedError('SIGINT'));
    const calls: DoctorCheckId[] = [];
    const checks = checksFor(
      DOCTOR_CHECK_ORDER.map(() => ({ status: 'healthy' as const, message: 'ok' })),
    ).map((check) => ({
      id: check.id,
      run: async () => {
        calls.push(check.id);
        return check.run();
      },
    }));

    await expect(
      runDoctor({
        context: {
          applicationVersion: '0.1.0',
          now: () => generatedAt,
          monotonicNow: () => 1,
        },
        checks,
        signal: controller.signal,
      }),
    ).rejects.toMatchObject({
      name: 'DoctorInterruptedError',
      signal: 'SIGINT',
      message: 'Relay doctor interrupted by SIGINT.',
    });
    expect(calls).toEqual([]);
  });

  it('rejects when an abort after the first check prevents the next check', async () => {
    const controller = new AbortController();
    const calls: DoctorCheckId[] = [];
    const checks = checksFor(
      DOCTOR_CHECK_ORDER.map(() => ({ status: 'healthy' as const, message: 'ok' })),
    ).map((check, index) => ({
      id: check.id,
      run: async () => {
        calls.push(check.id);
        if (index === 0) {
          controller.abort(new DoctorInterruptedError('SIGTERM'));
        }
        return check.run();
      },
    }));

    await expect(
      runDoctor({
        context: {
          applicationVersion: '0.1.0',
          now: () => generatedAt,
          monotonicNow: () => 1,
        },
        checks,
        signal: controller.signal,
      }),
    ).rejects.toMatchObject({
      name: 'DoctorInterruptedError',
      signal: 'SIGTERM',
      message: 'Relay doctor interrupted by SIGTERM.',
    });
    expect(calls).toEqual([DOCTOR_CHECK_ORDER[0]]);
  });

  it('rethrows a DoctorInterruptedError from a check without sanitizing it', async () => {
    const checks = checksFor(
      DOCTOR_CHECK_ORDER.map(() => ({ status: 'healthy' as const, message: 'ok' })),
    ).map((check, index) => ({
      id: check.id,
      run:
        index === 4
          ? async () => {
              throw new DoctorInterruptedError('SIGINT');
            }
          : check.run,
    }));

    await expect(
      runDoctor({
        context: {
          applicationVersion: '0.1.0',
          now: () => generatedAt,
          monotonicNow: () => 1,
        },
        checks,
      }),
    ).rejects.toMatchObject({
      name: 'DoctorInterruptedError',
      signal: 'SIGINT',
      message: 'Relay doctor interrupted by SIGINT.',
    });
  });

  it('rejects a check collection whose public order differs from the contract', async () => {
    await expect(
      runDoctor({
        context: { applicationVersion: '0.1.0', now: () => generatedAt, monotonicNow: () => 0 },
        checks: [
          ...checksFor(
            DOCTOR_CHECK_ORDER.map(() => ({ status: 'healthy' as const, message: 'ok' })),
          ),
        ].reverse(),
      }),
    ).rejects.toThrow('Doctor checks must match DOCTOR_CHECK_ORDER exactly.');
  });
});
