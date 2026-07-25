import type { IncomingMessage, ServerResponse } from 'node:http';
import type { EditTaskInput, TaskApplication } from '../../application/tasks/task-application.js';
import { readJsonBody, requireEmptyBody, sendJson } from './http-json.js';
import { toTaskDto } from './task-dto.js';
import {
  createTaskSchema,
  decodeTaskId,
  editTaskSchema,
  parseTaskListQuery,
} from './task-schemas.js';

type ActionName = 'moveToInbox' | 'activate' | 'start' | 'moveToBacklog' | 'complete' | 'archive';
const actions: Record<string, ActionName> = {
  'move-to-inbox': 'moveToInbox',
  activate: 'activate',
  start: 'start',
  'move-to-backlog': 'moveToBacklog',
  complete: 'complete',
  archive: 'archive',
};

export async function routeTaskRequest(
  request: IncomingMessage,
  response: ServerResponse,
  url: URL,
  application: TaskApplication,
): Promise<boolean> {
  if (url.pathname === '/api/tasks') {
    if (request.method === 'POST') {
      const body = createTaskSchema.parse(await readJsonBody(request));
      const task = application.create({
        title: body.title,
        ...optionalFields(body),
        creator: { type: 'HUMAN', name: null },
      });
      sendJson(
        response,
        201,
        { task: toTaskDto(task) },
        { Location: `/api/tasks/${encodeURIComponent(task.id)}` },
      );
    } else if (request.method === 'GET') {
      sendJson(response, 200, {
        tasks: application.list(parseTaskListQuery(url.searchParams)).map(toTaskDto),
      });
    } else sendMethodNotAllowed(response, 'GET, POST');
    return true;
  }
  const match = /^\/api\/tasks\/([^/]+)(?:\/([^/]+))?$/.exec(url.pathname);
  if (!match) return false;
  const id = decodeTaskId(match[1]!);
  const action = match[2] === undefined ? undefined : actions[match[2]];
  if (match[2] !== undefined && action === undefined) return false;
  if (action !== undefined) {
    if (request.method !== 'POST') sendMethodNotAllowed(response, 'POST');
    else {
      await requireEmptyBody(request);
      sendJson(response, 200, { task: toTaskDto(application[action]({ id })) });
    }
    return true;
  }
  if (request.method === 'GET')
    sendJson(response, 200, { task: toTaskDto(application.get({ id })) });
  else if (request.method === 'PATCH') {
    const changes = editTaskSchema.parse(await readJsonBody(request));
    sendJson(response, 200, {
      task: toTaskDto(application.edit({ id, ...optionalFields(changes) })),
    });
  } else sendMethodNotAllowed(response, 'GET, PATCH');
  return true;
}

function sendMethodNotAllowed(response: ServerResponse, allow: string): void {
  sendJson(
    response,
    405,
    { error: { code: 'METHOD_NOT_ALLOWED', message: 'Method is not allowed for this route.' } },
    { Allow: allow },
  );
}

function optionalFields(value: {
  readonly title?: string | undefined;
  readonly description?: string | null | undefined;
  readonly priority?: 'LOW' | 'NORMAL' | 'HIGH' | null | undefined;
  readonly workspace?: string | null | undefined;
  readonly sourceContext?: string | null | undefined;
}): Omit<EditTaskInput, 'id'> {
  const result: Omit<EditTaskInput, 'id'> = {
    ...(value.title === undefined ? {} : { title: value.title }),
    ...(value.description === undefined ? {} : { description: value.description }),
    ...(value.priority === undefined ? {} : { priority: value.priority }),
    ...(value.workspace === undefined ? {} : { workspace: value.workspace }),
    ...(value.sourceContext === undefined ? {} : { sourceContext: value.sourceContext }),
  };
  return result;
}
