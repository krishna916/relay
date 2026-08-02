import { cliFailure, cliSuccess } from './output/cli-result.js';
import {
  SetupConflictError,
  SetupNotFoundError,
  SetupStorageError,
  SetupUsageError,
} from '../../distribution/setup/setup-errors.js';
import { CliUsageError } from './output/cli-errors.js';
import { RelayError } from '../../shared/errors.js';

type Writer = { write(text: string): unknown };

export function writeOperationalSuccess(
  stdout: Writer,
  command: string,
  data: Record<string, unknown>,
): void {
  stdout.write(`${JSON.stringify(cliSuccess({ command, ...data }))}\n`);
}

export function writeOperationalError(stdout: Writer, stderr: Writer, error: unknown): number {
  const mapped = mapOperationalError(error);
  stdout.write(`${JSON.stringify(cliFailure(mapped.code, mapped.message))}\n`);
  stderr.write(
    `${mapped.code === 'INTERNAL_ERROR' ? formatInternalError(error) : mapped.message}\n`,
  );
  return mapped.exitCode;
}

function formatInternalError(error: unknown): string {
  if (!(error instanceof Error))
    return `An unexpected internal error occurred. Details: ${String(error)}`;
  const detail = error.stack ?? error.message;
  if (error.cause === undefined) return detail;
  const cause =
    error.cause instanceof Error ? (error.cause.stack ?? error.cause.message) : String(error.cause);
  return `${detail}\nCaused by: ${cause}`;
}

function mapOperationalError(error: unknown): { code: string; message: string; exitCode: number } {
  if (error instanceof SetupNotFoundError)
    return { code: 'NOT_FOUND', message: error.message, exitCode: 3 };
  if (error instanceof SetupConflictError)
    return { code: 'CONFLICT', message: error.message, exitCode: 4 };
  if (error instanceof SetupStorageError)
    return { code: 'STORAGE_ERROR', message: error.message, exitCode: 5 };
  if (
    error instanceof CliUsageError ||
    error instanceof SetupUsageError ||
    (error instanceof RelayError && error.constructor !== RelayError)
  )
    return { code: 'VALIDATION_ERROR', message: error.message, exitCode: 2 };
  return { code: 'INTERNAL_ERROR', message: 'An unexpected internal error occurred.', exitCode: 1 };
}
