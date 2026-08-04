import {
  DOCTOR_CHECK_ORDER,
  DOCTOR_REPORT_SCHEMA_VERSION,
  type DoctorCheck,
  type DoctorCheckContext,
  type DoctorCheckResult,
  type DoctorReport,
  type DoctorStatus,
} from './doctor-types.js';

export async function runDoctor(input: {
  readonly context: DoctorCheckContext;
  readonly checks: readonly DoctorCheck[];
}): Promise<DoctorReport> {
  assertCheckOrder(input.checks);
  const checks: DoctorCheckResult[] = [];

  for (const check of input.checks) {
    const startedAt = input.context.monotonicNow();
    try {
      const result = await check.run();
      checks.push({
        id: check.id,
        ...sanitizeResult(result),
        durationMs: durationMs(startedAt, input.context.monotonicNow()),
      });
    } catch {
      checks.push({
        id: check.id,
        status: 'failure',
        code: `${check.id}.internal-error`,
        message: 'The diagnostic check could not be completed safely.',
        durationMs: durationMs(startedAt, input.context.monotonicNow()),
      });
    }
  }

  return {
    schemaVersion: DOCTOR_REPORT_SCHEMA_VERSION,
    relayVersion: input.context.applicationVersion,
    generatedAt: input.context.now().toISOString(),
    summary: {
      healthy: checks.filter((check) => check.status === 'healthy').length,
      warning: checks.filter((check) => check.status === 'warning').length,
      failure: checks.filter((check) => check.status === 'failure').length,
      skipped: checks.filter((check) => check.status === 'skipped').length,
    },
    checks,
  };
}

function assertCheckOrder(checks: readonly DoctorCheck[]): void {
  const actual = checks.map((check) => check.id);
  if (
    actual.length !== DOCTOR_CHECK_ORDER.length ||
    actual.some((id, index) => id !== DOCTOR_CHECK_ORDER[index])
  ) {
    throw new Error('Doctor checks must match DOCTOR_CHECK_ORDER exactly.');
  }
}

function durationMs(startedAt: number, finishedAt: number): number {
  return Math.max(0, Math.round(finishedAt - startedAt));
}

function sanitizeResult(
  result: Omit<DoctorCheckResult, 'id' | 'durationMs'>,
): Omit<DoctorCheckResult, 'id' | 'durationMs'> {
  const status: DoctorStatus = result.status;
  if (!['healthy', 'warning', 'failure', 'skipped'].includes(status)) {
    throw new Error('Doctor check returned an invalid status.');
  }
  if (typeof result.code !== 'string' || typeof result.message !== 'string') {
    throw new Error('Doctor check returned an invalid result.');
  }
  return {
    status,
    code: result.code,
    message: result.message,
    ...(result.details === undefined ? {} : { details: sanitizeDetails(result.details) }),
  };
}

function sanitizeDetails(
  details: Readonly<Record<string, string | number | boolean | readonly string[]>>,
): Readonly<Record<string, string | number | boolean | readonly string[]>> {
  return Object.fromEntries(
    Object.entries(details)
      .filter(([key, value]) => /^[a-z][a-zA-Z0-9]*$/.test(key) && value !== undefined)
      .sort(([left], [right]) => left.localeCompare(right)),
  ) as Readonly<Record<string, string | number | boolean | readonly string[]>>;
}
