import { z } from 'zod';
import type { TaskStatus } from '../../domain/task/task-status.js';
import { invalidRequest } from './http-errors.js';

const optionalText = (maximum: number) =>
  z
    .string()
    .trim()
    .max(maximum)
    .transform((value) => (value === '' ? null : value))
    .nullable()
    .optional();
const editableFields = {
  title: z.string().trim().min(1, 'Title is required').max(300).optional(),
  description: optionalText(10_000),
  priority: z.enum(['LOW', 'NORMAL', 'HIGH']).nullable().optional(),
  workspace: optionalText(255),
  sourceContext: optionalText(1_000),
};

export const createTaskSchema = z
  .object({
    title: z.string().trim().min(1, 'Title is required').max(300),
    description: optionalText(10_000),
    priority: z.enum(['LOW', 'NORMAL', 'HIGH']).nullable().optional(),
    workspace: optionalText(255),
    sourceContext: optionalText(1_000),
  })
  .strict();
export const editTaskSchema = z
  .object(editableFields)
  .strict()
  .refine((value) => Object.values(value).some((item) => item !== undefined), {
    message: 'At least one editable task field is required.',
  });

export function decodeTaskId(segment: string): string {
  try {
    const id = decodeURIComponent(segment);
    if (id.includes('/') || id.trim() !== id || id.length === 0 || id.length > 100)
      throw invalidRequest('Task ID is invalid.');
    return id;
  } catch (error) {
    if (error instanceof Error && error.name === 'URIError')
      throw invalidRequest('Task ID is invalid.');
    throw error;
  }
}

export function parseTaskListQuery(searchParams: URLSearchParams): {
  readonly statuses: readonly TaskStatus[];
  readonly limit: number;
} {
  for (const key of searchParams.keys()) {
    if (key !== 'view' && key !== 'limit')
      throw invalidRequest(`Unsupported query parameter: ${key}.`);
  }
  const view = single(searchParams, 'view');
  const limit = single(searchParams, 'limit');
  const viewMap: Record<string, readonly TaskStatus[]> = {
    inbox: ['INBOX'],
    active: ['ACTIVE', 'IN_PROGRESS'],
    backlog: ['BACKLOG'],
    completed: ['DONE'],
  };
  const resolvedView = view ?? 'active';
  const statuses = viewMap[resolvedView];
  if (!statuses) throw invalidRequest('view must be inbox, active, backlog, or completed.');
  const resolvedLimit =
    limit === undefined ? (resolvedView === 'completed' ? 50 : 100) : parseLimit(limit);
  return { statuses, limit: resolvedLimit };
}

function single(params: URLSearchParams, name: string): string | undefined {
  const values = params.getAll(name);
  if (values.length > 1) throw invalidRequest(`${name} must not be repeated.`);
  return values[0];
}

function parseLimit(value: string): number {
  if (!/^\d+$/.test(value)) throw invalidRequest('limit must be an integer from 1 through 200.');
  const limit = Number(value);
  if (!Number.isSafeInteger(limit) || limit < 1 || limit > 200)
    throw invalidRequest('limit must be an integer from 1 through 200.');
  return limit;
}
