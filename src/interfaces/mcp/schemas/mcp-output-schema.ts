import { CONTRACT_SCHEMA_VERSION } from '../../contracts/contract-version.js';
import { warningSchema } from '../../contracts/warning-contract.js';
import { z } from 'zod';

export function createMcpOutputSchema<T extends z.ZodType>(data: T) {
  return z
    .object({
      schemaVersion: z.literal(CONTRACT_SCHEMA_VERSION),
      data,
      warnings: z.array(warningSchema),
    })
    .strict();
}
