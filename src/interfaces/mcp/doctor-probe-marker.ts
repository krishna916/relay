import { writeFileSync } from 'node:fs';

export function writeDoctorProbeMarker(): void {
  if (
    process.env.RELAY_DOCTOR_TEST_HOLD_PROBE !== 'mcp' ||
    (process.env.NODE_ENV !== 'test' && process.env.RELAY_RUN_PACKAGE_SMOKE !== '1')
  )
    return;
  const marker = process.env.RELAY_DOCTOR_TEST_CHILD_MARKER;
  if (marker !== undefined) writeFileSync(marker, String(process.pid));
}
