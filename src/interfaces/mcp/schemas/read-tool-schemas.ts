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
import { createMcpOutputSchema } from './mcp-output-schema.js';

export const taskCaptureOutputSchema = createMcpOutputSchema(taskCaptureResultSchema);
export const taskListOutputSchema = createMcpOutputSchema(taskListResultSchema);
export const taskGetOutputSchema = createMcpOutputSchema(taskGetResultSchema);
export const taskFindSimilarOutputSchema = createMcpOutputSchema(taskFindSimilarResultSchema);
export const sessionCapturesOutputSchema = createMcpOutputSchema(sessionCapturesResultSchema);

export {
  agentCaptureInputSchema,
  findSimilarInputSchema,
  taskGetInputSchema,
  taskListInputSchema,
  sessionCapturesInputSchema,
};
