import { describe, expect, it } from 'vitest';
import {
  DOCTOR_CHECK_ORDER,
  type DoctorCheck,
} from '../../../../src/distribution/doctor/doctor-types.js';
import { parseDoctorCommand } from '../../../../src/interfaces/cli/parse-doctor-command.js';
import { writeDoctorReport } from '../../../../src/interfaces/cli/doctor-output.js';
import {
  runDoctorCommand,
  type DoctorCommandDependencies,
} from '../../../../src/interfaces/cli/run-doctor-command.js';
import { DoctorInterruptedError } from '../../../../src/distribution/doctor/doctor-interruption.js';

function report() {
  return {
    schemaVersion: 1 as const,
    relayVersion: '0.1.0',
    generatedAt: '2026-08-04T12:00:00.000Z',
    summary: { healthy: 14, warning: 0, failure: 0, skipped: 0 },
    checks: DOCTOR_CHECK_ORDER.map((id) => ({
      id,
      status: 'healthy' as const,
      code: `${id}.ok`,
      message: 'ready',
      durationMs: 0,
    })),
  };
}

function dependencies(
  overrides: Partial<DoctorCommandDependencies> = {},
): DoctorCommandDependencies {
  const checks: readonly DoctorCheck[] = DOCTOR_CHECK_ORDER.map((id) => ({
    id,
    run: async () => ({ status: 'healthy' as const, code: `${id}.ok`, message: 'ready' }),
  }));
  return {
    applicationVersion: '0.1.0',
    createChecks: () => checks,
    now: () => new Date('2026-08-04T12:00:00.000Z'),
    monotonicNow: () => 0,
    stdout: {
      write: (text) => {
        outputs.push(text);
      },
    },
    stderr: {
      write: (text) => {
        errors.push(text);
      },
    },
    ...overrides,
  };
}

const outputs: string[] = [];
const errors: string[] = [];

describe('relay doctor CLI', () => {
  it('accepts only the locked doctor grammar', () => {
    expect(parseDoctorCommand(['doctor'])).toEqual({ output: 'human' });
    expect(parseDoctorCommand(['doctor', '--output', 'json'])).toEqual({ output: 'json' });
    expect(() => parseDoctorCommand(['doctor', '--output'])).toThrow('Missing value for --output.');
    expect(() => parseDoctorCommand(['doctor', '--output', 'yaml'])).toThrow(
      'Unsupported doctor output.',
    );
    expect(() => parseDoctorCommand(['doctor', '--output', 'json', '--output', 'json'])).toThrow(
      'may be supplied only once',
    );
  });

  it('writes stable JSON and human output markers', () => {
    const json: string[] = [];
    writeDoctorReport(
      {
        write: (text) => {
          json.push(text);
        },
      },
      report(),
      'json',
    );
    expect(json).toEqual([`${JSON.stringify(report())}\n`]);
    const human: string[] = [];
    writeDoctorReport(
      {
        write: (text) => {
          human.push(text);
        },
      },
      report(),
      'human',
    );
    expect(human.join('')).toContain('[OK] runtime.version: ready');
    expect(human.join('')).toContain(
      'Doctor summary: 14 healthy, 0 warning, 0 failure, 0 skipped.',
    );
  });

  it('returns usage 2, warning-only 0, and failure 1', async () => {
    outputs.length = 0;
    errors.length = 0;
    await expect(runDoctorCommand(['doctor', '--bad'], dependencies())).resolves.toBe(2);
    expect(errors.join('')).toContain('Unknown doctor option');
    await expect(runDoctorCommand(['doctor', '--output', 'json'], dependencies())).resolves.toBe(0);
    const failingChecks = DOCTOR_CHECK_ORDER.map((id, index) => ({
      id,
      run: async () => ({
        status: (index === 0 ? 'failure' : 'healthy') as 'failure' | 'healthy',
        code: `${id}.result`,
        message: 'result',
      }),
    }));
    await expect(
      runDoctorCommand(['doctor'], dependencies({ createChecks: () => failingChecks })),
    ).resolves.toBe(1);
  });

  it.each([
    ['SIGINT', 130],
    ['SIGTERM', 143],
  ] as const)('%s returns %d and emits no report', async (signal, expectedExitCode) => {
    outputs.length = 0;
    errors.length = 0;
    let controller!: AbortController;
    let releaseCheck!: () => void;
    let releaseCleanup!: () => void;
    const checkStarted = new Promise<void>((resolve) => {
      releaseCheck = resolve;
    });
    const checks: readonly DoctorCheck[] = DOCTOR_CHECK_ORDER.map((id, index) => ({
      id,
      run:
        index === 0
          ? async () => {
              releaseCheck();
              await new Promise((resolve) => setTimeout(resolve, 0));
              return { status: 'healthy' as const, code: `${id}.ok`, message: 'ready' };
            }
          : async () => ({ status: 'healthy' as const, code: `${id}.ok`, message: 'ready' }),
    }));
    const commandPromise = runDoctorCommand(
      ['doctor', '--output', 'json'],
      dependencies({
        createChecks: () => checks,
        installSignalHandlers: ({ controller: captured }) => {
          controller = captured;
          const cleanupPromise = new Promise<void>((resolve) => {
            releaseCleanup = resolve;
          });
          return {
            getSignal: () => signal,
            cleanupStarted: () => cleanupPromise,
            remove: () => undefined,
          };
        },
      }),
    );
    await checkStarted;
    controller.abort(new DoctorInterruptedError(signal));
    releaseCleanup();

    await expect(commandPromise).resolves.toBe(expectedExitCode);
    expect(outputs).toEqual([]);
    expect(errors).toEqual([]);
  });
});
