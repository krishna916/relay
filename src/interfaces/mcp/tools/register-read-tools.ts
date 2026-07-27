import type { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import type { TaskApplication } from '../../../application/tasks/task-application.js';
import { toMcpError } from '../mapping/mcp-errors.js';
import { mcpSuccess } from '../mapping/mcp-result.js';
import { matchReason, toTaskDto } from '../../contracts/task-dto.js';
import {
  findSimilarInputSchema,
  sessionCapturesOutputSchema,
  sessionCapturesInputSchema,
  taskFindSimilarOutputSchema,
  taskGetOutputSchema,
  taskGetInputSchema,
  taskListOutputSchema,
  taskListInputSchema,
} from '../schemas/read-tool-schemas.js';
import { TASK_STATUSES } from '../../../domain/task/task-status.js';

export function registerReadTools(server: McpServer, taskApplication: TaskApplication): void {
  server.registerTool(
    'task_list',
    {
      description: 'List approved Relay tasks',
      inputSchema: taskListInputSchema,
      outputSchema: taskListOutputSchema,
    },
    async (input) => {
      try {
        const parsed = input;
        const tasks = taskApplication.list({
          statuses: parsed.statuses ?? TASK_STATUSES,
          limit: parsed.limit,
          ...(parsed.workspace === undefined ? {} : { workspace: parsed.workspace }),
        });
        return mcpSuccess({ tasks: tasks.map(toTaskDto), count: tasks.length });
      } catch (error) {
        return toMcpError(error);
      }
    },
  );
  server.registerTool(
    'task_get',
    {
      description: 'Get one Relay task',
      inputSchema: taskGetInputSchema,
      outputSchema: taskGetOutputSchema,
    },
    async (input) => {
      try {
        const parsed = input;
        return mcpSuccess({ task: toTaskDto(taskApplication.get({ id: parsed.taskId })) });
      } catch (error) {
        return toMcpError(error);
      }
    },
  );
  server.registerTool(
    'task_find_similar',
    {
      description: 'Find advisory similar Relay tasks',
      inputSchema: findSimilarInputSchema,
      outputSchema: taskFindSimilarOutputSchema,
    },
    async (input) => {
      try {
        const parsed = input;
        const candidates = taskApplication
          .findSimilar({
            title: parsed.title,
            limit: parsed.limit,
            ...(parsed.workspace === undefined ? {} : { workspace: parsed.workspace }),
          })
          .map((task) => ({
            task: toTaskDto(task),
            matchReason: matchReason(task, parsed.title),
          }));
        return mcpSuccess({ candidates });
      } catch (error) {
        return toMcpError(error);
      }
    },
  );
  server.registerTool(
    'session_captures_list',
    {
      description: 'List captured Relay tasks for a session',
      inputSchema: sessionCapturesInputSchema,
      outputSchema: sessionCapturesOutputSchema,
    },
    async (input) => {
      try {
        const parsed = input;
        const tasks = taskApplication.listSessionCaptures(parsed);
        return mcpSuccess({
          sessionId: parsed.sessionId,
          tasks: tasks.map(toTaskDto),
          count: tasks.length,
        });
      } catch (error) {
        return toMcpError(error);
      }
    },
  );
}
