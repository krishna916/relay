import { z } from 'zod';

export const SESSION_ID_PATTERN = /^[A-Za-z0-9._:-]+$/;

export const sessionIdSchema = z
  .string()
  .trim()
  .min(1, 'sessionId is required')
  .max(128, 'sessionId must be at most 128 characters')
  .regex(SESSION_ID_PATTERN, 'sessionId has an invalid format');

export const sessionCapturesInputSchema = z
  .object({
    sessionId: sessionIdSchema,
    limit: z.number().int().min(1).max(100).default(100),
  })
  .strict();

export function parseSessionId(value: unknown): string {
  return sessionIdSchema.parse(value);
}
