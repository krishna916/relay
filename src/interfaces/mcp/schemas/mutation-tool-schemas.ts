import {
  taskArchiveInputSchema,
  taskArchiveResultSchema,
  taskCompleteInputSchema,
  taskCompleteResultSchema,
  taskEditInputSchema,
  taskEditResultSchema,
  taskStartInputSchema,
  taskStartResultSchema,
  taskTriageInputSchema,
  taskTriageResultSchema,
} from '../../contracts/task-contract.js';
import { CONTRACT_SCHEMA_VERSION } from '../../contracts/contract-version.js';
import { warningSchema } from '../../contracts/warning-contract.js';
import { z } from 'zod';

const outputSchema = (data: z.ZodType) =>
  z
    .object({
      schemaVersion: z.literal(CONTRACT_SCHEMA_VERSION),
      data,
      warnings: z.array(warningSchema),
    })
    .strict();

export {
  taskArchiveInputSchema,
  taskCompleteInputSchema,
  taskEditInputSchema,
  taskStartInputSchema,
  taskTriageInputSchema,
};
export const taskArchiveOutputSchema = outputSchema(taskArchiveResultSchema);
export const taskCompleteOutputSchema = outputSchema(taskCompleteResultSchema);
export const taskEditOutputSchema = outputSchema(taskEditResultSchema);
export const taskStartOutputSchema = outputSchema(taskStartResultSchema);
export const taskTriageOutputSchema = outputSchema(taskTriageResultSchema);
