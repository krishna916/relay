import { z } from 'zod';

export const CONTRACT_ERROR_CODES = [
  'VALIDATION_ERROR',
  'NOT_FOUND',
  'CONFLICT',
  'ARCHIVED_TASK',
  'STORAGE_ERROR',
  'INTERNAL_ERROR',
] as const;

export type ContractErrorCode = (typeof CONTRACT_ERROR_CODES)[number];

export const contractErrorSchema = z
  .object({
    code: z.enum(CONTRACT_ERROR_CODES),
    message: z.string().min(1),
    details: z.record(z.string(), z.unknown()).optional(),
  })
  .strict();

const EXIT_CODES: Record<ContractErrorCode, number> = {
  VALIDATION_ERROR: 2,
  NOT_FOUND: 3,
  CONFLICT: 4,
  ARCHIVED_TASK: 4,
  STORAGE_ERROR: 5,
  INTERNAL_ERROR: 1,
};

export function errorCodeToExitCode(code: ContractErrorCode): number {
  return EXIT_CODES[code];
}
