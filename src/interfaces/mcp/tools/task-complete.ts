import type { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import type { TaskApplication } from '../../../application/tasks/task-application.js';
import { lifecycleChange } from '../mapping/change-metadata.js';
import { toMcpError } from '../mapping/mcp-errors.js';
import { mcpSuccess } from '../mapping/mcp-result.js';
import { toTaskMcpDto } from '../mapping/task-mcp-dto.js';
import {
  taskCompleteInputSchema,
  taskCompleteOutputSchema,
} from '../schemas/mutation-tool-schemas.js';

export function registerTaskCompleteTool(server: McpServer, application: TaskApplication): void {
  server.registerTool(
    'task_complete',
    {
      description: 'Complete a task only after explicit user direction in the active conversation',
      inputSchema: taskCompleteInputSchema,
      outputSchema: taskCompleteOutputSchema,
    },
    async (input) => {
      try {
        const mutation = application.completeWithPrevious({ id: input.taskId });
        return mcpSuccess({
          task: toTaskMcpDto(mutation.task),
          change: lifecycleChange(mutation.before, mutation.task, 'COMPLETED'),
        });
      } catch (error) {
        return toMcpError(error);
      }
    },
  );
}
