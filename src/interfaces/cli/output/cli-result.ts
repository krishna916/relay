import { CONTRACT_SCHEMA_VERSION } from '../../contracts/contract-version.js';

export function cliSuccess(data: Record<string, unknown>, warnings: readonly unknown[] = []) {
  return { schemaVersion: CONTRACT_SCHEMA_VERSION, ok: true, data, warnings };
}

export function cliFailure(code: string, message: string) {
  return { schemaVersion: CONTRACT_SCHEMA_VERSION, ok: false, error: { code, message } };
}
