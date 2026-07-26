import {
  agentCaptureInputSchema,
  findSimilarInputSchema,
  taskGetInputSchema,
  taskListInputSchema,
} from '../../contracts/task-contract.js';
import { sessionCapturesInputSchema } from '../../contracts/session-contract.js';
import {
  sessionCapturesResultSchema,
  taskCaptureResultSchema,
  taskFindSimilarResultSchema,
  taskGetResultSchema,
  taskListResultSchema,
} from '../../contracts/task-contract.js';
import { CONTRACT_SCHEMA_VERSION } from '../../contracts/contract-version.js';
import { warningSchema } from '../../contracts/warning-contract.js';
import { z } from 'zod';

const rawToolInputSchema = z.object({}).passthrough();
const outputSchema = (data: z.ZodType) =>
  z
    .object({
      schemaVersion: z.literal(CONTRACT_SCHEMA_VERSION),
      data,
      warnings: z.array(warningSchema),
    })
    .strict();

export const rawMcpToolInputSchema = rawToolInputSchema;
export const taskCaptureOutputSchema = outputSchema(taskCaptureResultSchema);
export const taskListOutputSchema = outputSchema(taskListResultSchema);
export const taskGetOutputSchema = outputSchema(taskGetResultSchema);
export const taskFindSimilarOutputSchema = outputSchema(taskFindSimilarResultSchema);
export const sessionCapturesOutputSchema = outputSchema(sessionCapturesResultSchema);

export {
  agentCaptureInputSchema,
  findSimilarInputSchema,
  taskGetInputSchema,
  taskListInputSchema,
  sessionCapturesInputSchema,
};
