import {
  ErrorResponseSchema,
  TaskListResponseSchema,
  TaskResponseSchema,
  type CreateTaskInput,
  type EditTaskInput,
  type TaskDto,
  type TaskView,
} from './task-contracts.js';

export class RelayApiError extends Error {
  readonly status: number;
  readonly code: string;
  readonly details?: Readonly<Record<string, readonly string[]>>;

  constructor(
    status: number,
    code: string,
    message: string,
    details?: Readonly<Record<string, readonly string[]>>,
  ) {
    super(message);
    this.name = 'RelayApiError';
    this.status = status;
    this.code = code;
    if (details !== undefined) this.details = details;
  }
}

export async function createTask(input: CreateTaskInput, signal?: AbortSignal): Promise<TaskDto> {
  return singleTask('/api/tasks', jsonRequest('POST', input, signal));
}

export async function getTask(id: string, signal?: AbortSignal): Promise<TaskDto> {
  return singleTask(taskPath(id), signal === undefined ? {} : { signal });
}

export async function listTasks(
  view: TaskView,
  limit?: number,
  signal?: AbortSignal,
): Promise<readonly TaskDto[]> {
  const params = new URLSearchParams({ view });
  if (limit !== undefined) params.set('limit', String(limit));
  const response = await request(
    `/api/tasks?${params.toString()}`,
    signal === undefined ? {} : { signal },
  );
  const payload = await responsePayload(response);
  const parsed = TaskListResponseSchema.safeParse(payload);
  if (!parsed.success) throw invalidResponse(false);
  return parsed.data.tasks;
}

export async function editTask(
  id: string,
  input: EditTaskInput,
  signal?: AbortSignal,
): Promise<TaskDto> {
  return singleTask(taskPath(id), jsonRequest('PATCH', input, signal));
}

export async function moveTaskToInbox(id: string, signal?: AbortSignal): Promise<TaskDto> {
  return action(id, 'move-to-inbox', signal);
}

export async function activateTask(id: string, signal?: AbortSignal): Promise<TaskDto> {
  return action(id, 'activate', signal);
}

export async function startTask(id: string, signal?: AbortSignal): Promise<TaskDto> {
  return action(id, 'start', signal);
}

export async function moveTaskToBacklog(id: string, signal?: AbortSignal): Promise<TaskDto> {
  return action(id, 'move-to-backlog', signal);
}

export async function completeTask(id: string, signal?: AbortSignal): Promise<TaskDto> {
  return action(id, 'complete', signal);
}

export async function archiveTask(id: string, signal?: AbortSignal): Promise<TaskDto> {
  return action(id, 'archive', signal);
}

async function action(id: string, name: string, signal?: AbortSignal): Promise<TaskDto> {
  return singleTask(
    `${taskPath(id)}/${name}`,
    signal === undefined ? { method: 'POST' } : { method: 'POST', signal },
  );
}

async function singleTask(path: string, init: RequestInit): Promise<TaskDto> {
  const response = await request(path, init);
  const payload = await responsePayload(response);
  const parsed = TaskResponseSchema.safeParse(payload);
  if (!parsed.success) throw invalidResponse(false);
  return parsed.data.task;
}

async function request(path: string, init: RequestInit): Promise<Response> {
  const response = await fetch(path, init);
  if (!response.ok) {
    const payload = await jsonOrUndefined(response);
    const parsed = ErrorResponseSchema.safeParse(payload);
    if (!parsed.success) throw invalidResponse(true);
    throw new RelayApiError(
      response.status,
      parsed.data.error.code,
      parsed.data.error.message,
      parsed.data.error.details,
    );
  }
  return response;
}

async function responsePayload(response: Response): Promise<unknown> {
  const payload = await jsonOrUndefined(response);
  if (payload === undefined) throw invalidResponse(false);
  return payload;
}

async function jsonOrUndefined(response: Response): Promise<unknown> {
  try {
    return await response.json();
  } catch {
    return undefined;
  }
}

function jsonRequest(method: 'POST' | 'PATCH', body: object, signal?: AbortSignal): RequestInit {
  return {
    method,
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
    ...(signal === undefined ? {} : { signal }),
  };
}

function taskPath(id: string): string {
  return `/api/tasks/${encodeURIComponent(id)}`;
}

function invalidResponse(error: boolean): RelayApiError {
  return new RelayApiError(
    500,
    'INVALID_SERVER_RESPONSE',
    error ? 'Relay returned an invalid error response.' : 'Relay returned an invalid response.',
  );
}
