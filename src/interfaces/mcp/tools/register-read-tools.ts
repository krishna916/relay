import type { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import type { TaskApplication } from '../../../application/tasks/task-application.js';
import { toMcpError } from '../mapping/mcp-errors.js';
import { mcpSuccess } from '../mapping/mcp-result.js';
import { matchReason, toTaskMcpDto } from '../mapping/task-mcp-dto.js';
import {
  findSimilarInputSchema,
  rawMcpToolInputSchema,
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
      inputSchema: rawMcpToolInputSchema,
      outputSchema: taskListOutputSchema,
    },
    async (input) => {
      try {
        const parsed = taskListInputSchema.parse(input);
        const tasks = taskApplication.list({
          statuses: parsed.statuses ?? TASK_STATUSES,
          limit: parsed.limit,
          ...(parsed.workspace === undefined ? {} : { workspace: parsed.workspace }),
        });
        return mcpSuccess({ tasks: tasks.map(toTaskMcpDto), count: tasks.length });
      } catch (error) {
        return toMcpError(error);
      }
    },
  );
  server.registerTool(
    'task_get',
    {
      description: 'Get one Relay task',
      inputSchema: rawMcpToolInputSchema,
      outputSchema: taskGetOutputSchema,
    },
    async (input) => {
      try {
        const parsed = taskGetInputSchema.parse(input);
        return mcpSuccess({ task: toTaskMcpDto(taskApplication.get({ id: parsed.taskId })) });
      } catch (error) {
        return toMcpError(error);
      }
    },
  );
  server.registerTool(
    'task_find_similar',
    {
      description: 'Find advisory similar Relay tasks',
      inputSchema: rawMcpToolInputSchema,
      outputSchema: taskFindSimilarOutputSchema,
    },
    async (input) => {
      try {
        const parsed = findSimilarInputSchema.parse(input);
        const candidates = taskApplication
          .findSimilar({
            title: parsed.title,
            limit: parsed.limit,
            ...(parsed.workspace === undefined ? {} : { workspace: parsed.workspace }),
          })
          .map((task) => ({
            task: toTaskMcpDto(task),
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
      inputSchema: rawMcpToolInputSchema,
      outputSchema: sessionCapturesOutputSchema,
    },
    async (input) => {
      try {
        const parsed = sessionCapturesInputSchema.parse(input);
        const tasks = taskApplication.listSessionCaptures(parsed);
        return mcpSuccess({
          sessionId: parsed.sessionId,
          tasks: tasks.map(toTaskMcpDto),
          count: tasks.length,
        });
      } catch (error) {
        return toMcpError(error);
      }
    },
  );
}
