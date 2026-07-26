import { CONTRACT_SCHEMA_VERSION } from '../../contracts/contract-version.js';

export function mcpSuccess(data: Record<string, unknown>, warnings: readonly unknown[] = []) {
  const structuredContent = { schemaVersion: CONTRACT_SCHEMA_VERSION, data, warnings };
  return {
    structuredContent,
    content: [{ type: 'text' as const, text: JSON.stringify(structuredContent) }],
  };
}

export function mcpError(code: string, message: string) {
  const structuredContent = { schemaVersion: CONTRACT_SCHEMA_VERSION, error: { code, message } };
  return {
    isError: true,
    structuredContent,
    content: [{ type: 'text' as const, text: JSON.stringify(structuredContent) }],
  };
}
