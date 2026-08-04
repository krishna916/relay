export const DOCTOR_REPORT_SCHEMA_VERSION = 1 as const;

export type DoctorStatus = 'healthy' | 'warning' | 'failure' | 'skipped';

export type DoctorCheckId =
  | 'runtime.version'
  | 'runtime.platform'
  | 'package.assets'
  | 'paths.resolution'
  | 'paths.access'
  | 'database.state'
  | 'database.integrity'
  | 'database.native-addon'
  | 'integrations.codex'
  | 'integrations.claude-code'
  | 'integrations.generic-mcp'
  | 'compatibility.assets'
  | 'mcp.handshake'
  | 'ui.loopback';

export interface DoctorCheckResult {
  readonly id: DoctorCheckId;
  readonly status: DoctorStatus;
  readonly code: string;
  readonly message: string;
  readonly details?: Readonly<Record<string, string | number | boolean | readonly string[]>>;
  readonly durationMs: number;
}

export interface DoctorReport {
  readonly schemaVersion: 1;
  readonly relayVersion: string;
  readonly generatedAt: string;
  readonly summary: {
    readonly healthy: number;
    readonly warning: number;
    readonly failure: number;
    readonly skipped: number;
  };
  readonly checks: readonly DoctorCheckResult[];
}

export interface DoctorCheckContext {
  readonly applicationVersion: string;
  readonly now: () => Date;
  readonly monotonicNow: () => number;
}

export interface DoctorCheck {
  readonly id: DoctorCheckId;
  run(): Promise<Omit<DoctorCheckResult, 'id' | 'durationMs'>>;
}

export const DOCTOR_CHECK_ORDER = [
  'runtime.version',
  'runtime.platform',
  'package.assets',
  'paths.resolution',
  'paths.access',
  'database.state',
  'database.integrity',
  'database.native-addon',
  'integrations.codex',
  'integrations.claude-code',
  'integrations.generic-mcp',
  'compatibility.assets',
  'mcp.handshake',
  'ui.loopback',
] as const satisfies readonly DoctorCheckId[];
