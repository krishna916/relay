import type { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import type { TaskApplication } from '../../../application/tasks/task-application.js';
import { lifecycleChange } from '../../contracts/change-metadata.js';
import { toMcpError } from '../mapping/mcp-errors.js';
import { mcpSuccess } from '../mapping/mcp-result.js';
import { toTaskDto } from '../../contracts/task-dto.js';
import {
  taskArchiveInputSchema,
  taskArchiveOutputSchema,
} from '../schemas/mutation-tool-schemas.js';

export function registerTaskArchiveTool(server: McpServer, application: TaskApplication): void {
  server.registerTool(
    'task_archive',
    {
      description: 'Archive a task only after explicit user direction in the active conversation',
      inputSchema: taskArchiveInputSchema,
      outputSchema: taskArchiveOutputSchema,
    },
    async (input) => {
      try {
        const mutation = application.archive({ id: input.taskId });
        return mcpSuccess({
          task: toTaskDto(mutation.task),
          change: lifecycleChange(mutation.before, mutation.task, 'ARCHIVED'),
        });
      } catch (error) {
        return toMcpError(error);
      }
    },
  );
}
