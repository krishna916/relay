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
import { createMcpOutputSchema } from './mcp-output-schema.js';

export {
  taskArchiveInputSchema,
  taskCompleteInputSchema,
  taskEditInputSchema,
  taskStartInputSchema,
  taskTriageInputSchema,
};
export const taskArchiveOutputSchema = createMcpOutputSchema(taskArchiveResultSchema);
export const taskCompleteOutputSchema = createMcpOutputSchema(taskCompleteResultSchema);
export const taskEditOutputSchema = createMcpOutputSchema(taskEditResultSchema);
export const taskStartOutputSchema = createMcpOutputSchema(taskStartResultSchema);
export const taskTriageOutputSchema = createMcpOutputSchema(taskTriageResultSchema);
