export interface ExternalError {
  readonly code: string;
  readonly message: string;
  readonly details?: unknown;
}

export interface ExternalOperationResult {
  readonly schemaVersion: number;
  readonly data: unknown;
  readonly warnings: readonly unknown[];
}

export function normalizeCliSuccess(value: unknown): ExternalOperationResult {
  const envelope = record(value, 'CLI result');
  assertKeys(envelope, ['schemaVersion', 'ok', 'data', 'warnings'], 'CLI result');
  return {
    schemaVersion: number(envelope.schemaVersion),
    data: envelope.data,
    warnings: array(envelope.warnings),
  };
}

export function normalizeMcpSuccess(value: unknown): ExternalOperationResult {
  const envelope = record(value, 'MCP result');
  const structuredContent = record(envelope.structuredContent, 'MCP structured result');
  assertKeys(structuredContent, ['schemaVersion', 'data', 'warnings'], 'MCP structured result');
  return {
    schemaVersion: number(structuredContent.schemaVersion),
    data: structuredContent.data,
    warnings: array(structuredContent.warnings),
  };
}

export function normalizeCliError(value: unknown): ExternalError {
  return normalizeError(record(value, 'CLI error').error);
}

export function normalizeMcpError(value: unknown): ExternalError {
  if (value instanceof Error) {
    return { code: 'MCP_PROTOCOL_ERROR', message: value.message };
  }
  const envelope = record(value, 'MCP error');
  const structuredContent = envelope.structuredContent;
  return normalizeError(record(structuredContent, 'MCP structured error').error);
}

function normalizeError(value: unknown): ExternalError {
  const error = record(value, 'error');
  return {
    code: string(error.code),
    message: string(error.message),
    ...(error.details === undefined ? {} : { details: error.details }),
  };
}

function record(value: unknown, label: string): Record<string, unknown> {
  if (typeof value !== 'object' || value === null || Array.isArray(value)) {
    throw new Error(`${label} must be an object.`);
  }
  return value as Record<string, unknown>;
}

function assertKeys(
  value: Record<string, unknown>,
  expectedKeys: readonly string[],
  label: string,
): void {
  const actualKeys = Object.keys(value).sort();
  const sortedExpectedKeys = [...expectedKeys].sort();
  if (
    actualKeys.length !== sortedExpectedKeys.length ||
    actualKeys.some((key, index) => key !== sortedExpectedKeys[index])
  ) {
    throw new Error(
      `${label} keys must be exactly ${sortedExpectedKeys.join(', ')}; received ${actualKeys.join(', ')}.`,
    );
  }
}

function string(value: unknown): string {
  if (typeof value !== 'string') throw new Error('Expected a string contract field.');
  return value;
}

function number(value: unknown): number {
  if (typeof value !== 'number') throw new Error('Expected a numeric schema version.');
  return value;
}

function array(value: unknown): readonly unknown[] {
  if (!Array.isArray(value)) throw new Error('Expected an array contract field.');
  return value;
}
