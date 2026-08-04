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
