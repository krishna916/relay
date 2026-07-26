import { z } from 'zod';
import { CONTRACT_SCHEMA_VERSION } from './contract-version.js';
import { contractErrorSchema } from './error-contract.js';

export const duplicateWarningSchema = z
  .object({
    code: z.literal('POSSIBLE_DUPLICATE'),
    message: z.string().min(1),
    candidates: z.array(z.object({ id: z.string().min(1) }).strict()).max(5),
  })
  .strict();

export const warningSchema = z.union([duplicateWarningSchema]);

export const cliSuccessEnvelopeSchema = z
  .object({
    schemaVersion: z.literal(CONTRACT_SCHEMA_VERSION),
    ok: z.literal(true),
    data: z.unknown(),
    warnings: z.array(warningSchema),
  })
  .strict();

export const cliErrorEnvelopeSchema = z
  .object({
    schemaVersion: z.literal(CONTRACT_SCHEMA_VERSION),
    ok: z.literal(false),
    error: contractErrorSchema,
  })
  .strict();
