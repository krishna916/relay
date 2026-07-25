import { z } from 'zod';

export const TaskStatusSchema = z.enum([
  'INBOX',
  'ACTIVE',
  'IN_PROGRESS',
  'BACKLOG',
  'DONE',
  'ARCHIVED',
]);
export const TaskPrioritySchema = z.enum(['LOW', 'NORMAL', 'HIGH']);
export const TaskCreatorTypeSchema = z.enum(['HUMAN', 'AGENT']);
export const TaskViewSchema = z.enum(['inbox', 'active', 'backlog', 'completed']);

export const TaskDtoSchema = z.object({
  id: z.string(),
  title: z.string(),
  description: z.string().nullable(),
  status: TaskStatusSchema,
  priority: TaskPrioritySchema.nullable(),
  workspace: z.string().nullable(),
  sourceContext: z.string().nullable(),
  createdByType: TaskCreatorTypeSchema,
  createdByName: z.string().nullable(),
  createdAt: z.string(),
  updatedAt: z.string(),
  startedAt: z.string().nullable(),
  completedAt: z.string().nullable(),
  archivedAt: z.string().nullable(),
});

export const TaskResponseSchema = z.object({ task: TaskDtoSchema });
export const TaskListResponseSchema = z.object({ tasks: z.array(TaskDtoSchema) });
export const ErrorResponseSchema = z.object({
  error: z.object({
    code: z.string(),
    message: z.string(),
    details: z.record(z.string(), z.array(z.string())).optional(),
  }),
});

export const CreateTaskInputSchema = z.object({
  title: z.string(),
  description: z.string().nullable().optional(),
  priority: TaskPrioritySchema.nullable().optional(),
  workspace: z.string().nullable().optional(),
  sourceContext: z.string().nullable().optional(),
});
export const EditTaskInputSchema = CreateTaskInputSchema.partial().refine(
  (value) => Object.keys(value).length > 0,
  'At least one editable task field is required.',
);

export type TaskDto = z.infer<typeof TaskDtoSchema>;
export type TaskView = z.infer<typeof TaskViewSchema>;
export type CreateTaskInput = z.infer<typeof CreateTaskInputSchema>;
export type EditTaskInput = z.infer<typeof EditTaskInputSchema>;
