import { z } from 'zod';
import { sessionIdSchema } from './session-contract.js';

const nullableText = (maximum: number) => z.string().trim().min(1).max(maximum).nullable();
const optionalText = (maximum: number) => nullableText(maximum).optional();
const optionalEditableText = (maximum: number) => z.string().trim().min(1).max(maximum).optional();
const taskStatusSchema = z.enum(['INBOX', 'ACTIVE', 'IN_PROGRESS', 'BACKLOG', 'DONE', 'ARCHIVED']);
const taskPrioritySchema = z.enum(['LOW', 'NORMAL', 'HIGH']);

export const taskIdSchema = z.string().trim().min(1).max(100);

export const taskDtoSchema = z
  .object({
    id: z.string().min(1).max(100),
    title: z.string().trim().min(1).max(300),
    description: nullableText(10_000),
    status: taskStatusSchema,
    priority: taskPrioritySchema.nullable(),
    workspace: nullableText(255),
    sourceContext: nullableText(1_000),
    createdByType: z.enum(['HUMAN', 'AGENT']),
    createdByName: nullableText(100),
    sessionId: sessionIdSchema.nullable(),
    createdAt: z.string().datetime({ offset: true }),
    updatedAt: z.string().datetime({ offset: true }),
    startedAt: z.string().datetime({ offset: true }).nullable(),
    completedAt: z.string().datetime({ offset: true }).nullable(),
    archivedAt: z.string().datetime({ offset: true }).nullable(),
  })
  .strict();

export const agentCaptureInputSchema = z
  .object({
    title: z.string().trim().min(1).max(300),
    description: optionalText(10_000),
    priority: taskPrioritySchema.nullable().optional(),
    workspace: optionalText(255),
    sourceContext: optionalText(1_000),
    createdByName: z.string().trim().min(1).max(100),
    sessionId: sessionIdSchema,
  })
  .strict();

export const taskListInputSchema = z
  .object({
    statuses: z.array(taskStatusSchema).min(1).optional(),
    workspace: optionalText(255),
    limit: z.number().int().min(1).max(100).default(100),
  })
  .strict();

export const findSimilarInputSchema = z
  .object({
    title: z.string().trim().min(1).max(300),
    workspace: optionalText(255),
    limit: z.number().int().min(1).max(5).default(5),
  })
  .strict();

const editableInputFields = {
  title: z.string().trim().min(1).max(300).optional(),
  description: optionalEditableText(10_000),
  priority: taskPrioritySchema.optional(),
  workspace: optionalEditableText(255),
  sourceContext: optionalEditableText(1_000),
  clearDescription: z.literal(true).optional(),
  clearPriority: z.literal(true).optional(),
  clearWorkspace: z.literal(true).optional(),
  clearSourceContext: z.literal(true).optional(),
};

const hasEditableInput = (input: Record<string, unknown>) =>
  Object.entries(input).some(([key, value]) => key !== 'taskId' && value !== undefined);

const clearDirectivePairs = [
  { field: 'description', clearField: 'clearDescription' },
  { field: 'priority', clearField: 'clearPriority' },
  { field: 'workspace', clearField: 'clearWorkspace' },
  { field: 'sourceContext', clearField: 'clearSourceContext' },
] as const;

const hasConflictingClearDirective = (input: Record<string, unknown>) =>
  clearDirectivePairs.some(
    ({ field, clearField }) => input[field] !== undefined && input[clearField] === true,
  );

export const mutationInputSchema = z
  .object(editableInputFields)
  .strict()
  .refine(hasEditableInput, {
    message: 'At least one editable task field is required.',
  })
  .refine((input) => !hasConflictingClearDirective(input), {
    message: 'An editable field cannot be supplied with its clear flag.',
  });

export const taskEditInputSchema = z
  .object({ taskId: taskIdSchema, ...editableInputFields })
  .strict()
  .refine(hasEditableInput, { message: 'At least one editable task field is required.' })
  .refine((input) => !hasConflictingClearDirective(input), {
    message: 'An editable field cannot be supplied with its clear flag.',
  });

export const taskTriageInputSchema = z
  .object({
    taskId: taskIdSchema,
    target: z.enum(['INBOX', 'ACTIVE', 'BACKLOG']),
  })
  .strict();

export const taskGetInputSchema = z.object({ taskId: taskIdSchema }).strict();
export const taskStartInputSchema = z.object({ taskId: taskIdSchema }).strict();
export const taskCompleteInputSchema = z.object({ taskId: taskIdSchema }).strict();
export const taskArchiveInputSchema = z.object({ taskId: taskIdSchema }).strict();

export const taskChangeSchema = z
  .object({
    action: z.enum([
      'CREATED',
      'NO_CHANGE',
      'EDITED',
      'TRIAGED',
      'STARTED',
      'COMPLETED',
      'ARCHIVED',
    ]),
  })
  .strict();

const taskResultSchema = (actions: readonly [string, ...string[]]) =>
  z
    .object({
      task: taskDtoSchema,
      change: z.object({ action: z.enum(actions) }).strict(),
    })
    .strict();

export const taskCaptureResultSchema = taskResultSchema(['CREATED']);
export const taskGetResultSchema = z.object({ task: taskDtoSchema }).strict();
export const taskListResultSchema = z
  .object({ tasks: z.array(taskDtoSchema), count: z.number().int().nonnegative() })
  .strict();
export const similarCandidateSchema = z
  .object({ task: taskDtoSchema, matchReason: z.enum(['EXACT_TITLE', 'NORMALIZED_TITLE']) })
  .strict();
export const taskFindSimilarResultSchema = z
  .object({ candidates: z.array(similarCandidateSchema).max(5) })
  .strict();
export const sessionCapturesResultSchema = z
  .object({
    sessionId: sessionIdSchema,
    tasks: z.array(taskDtoSchema),
    count: z.number().int().nonnegative(),
  })
  .strict();
export const taskEditResultSchema = taskResultSchema(['EDITED', 'NO_CHANGE']);
export const taskTriageResultSchema = taskResultSchema(['TRIAGED', 'NO_CHANGE']);
export const taskStartResultSchema = taskResultSchema(['STARTED', 'NO_CHANGE']);
export const taskCompleteResultSchema = taskResultSchema(['COMPLETED', 'NO_CHANGE']);
export const taskArchiveResultSchema = taskResultSchema(['ARCHIVED', 'NO_CHANGE']);
