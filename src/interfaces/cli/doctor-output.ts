import {
  DOCTOR_CHECK_ORDER,
  DOCTOR_REPORT_SCHEMA_VERSION,
} from '../../distribution/doctor/doctor-types.js';
import type { DoctorCheckResult, DoctorReport } from '../../distribution/doctor/doctor-types.js';

type Writer = { write(text: string): unknown };

export function writeDoctorReport(
  stream: Writer,
  report: DoctorReport,
  output: 'human' | 'json',
): void {
  if (output === 'json') {
    stream.write(`${JSON.stringify(report)}\n`);
    return;
  }
  const lines = report.checks.map(formatCheck);
  lines.push(
    `Doctor summary: ${report.summary.healthy} healthy, ${report.summary.warning} warning, ${report.summary.failure} failure, ${report.summary.skipped} skipped.`,
  );
  stream.write(`${lines.join('\n')}\n`);
}

export function writeDoctorBootstrapFailure(stream: Writer, output: 'human' | 'json'): void {
  const checks: DoctorCheckResult[] = DOCTOR_CHECK_ORDER.map((id) => ({
    id,
    status: id === 'paths.resolution' ? 'failure' : 'skipped',
    code: id === 'paths.resolution' ? 'doctor.bootstrap-failed' : 'doctor.bootstrap-skipped',
    message:
      id === 'paths.resolution'
        ? 'Relay doctor could not initialize its diagnostic paths safely.'
        : 'This diagnostic was skipped because doctor initialization failed.',
    durationMs: 0,
  }));
  writeDoctorReport(
    stream,
    {
      schemaVersion: DOCTOR_REPORT_SCHEMA_VERSION,
      relayVersion: 'unknown',
      generatedAt: new Date().toISOString(),
      checks,
      summary: { healthy: 0, warning: 0, failure: 1, skipped: checks.length - 1 },
    },
    output,
  );
}

function formatCheck(check: DoctorCheckResult): string {
  const marker = { healthy: '[OK]', warning: '[WARN]', failure: '[FAIL]', skipped: '[SKIP]' }[
    check.status
  ];
  const details =
    check.details === undefined
      ? ''
      : Object.entries(check.details)
          .sort(([left], [right]) => left.localeCompare(right))
          .map(
            ([key, value]) =>
              `\n  ${key}: ${Array.isArray(value) ? JSON.stringify(value) : String(value)}`,
          )
          .join('');
  return `${marker} ${check.id}: ${check.message}${details}`;
}
