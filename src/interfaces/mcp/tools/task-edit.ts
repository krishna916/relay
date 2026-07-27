import type { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import type { TaskApplication } from '../../../application/tasks/task-application.js';
import { editChange } from '../mapping/change-metadata.js';
import { toMcpError } from '../mapping/mcp-errors.js';
import { mcpSuccess } from '../mapping/mcp-result.js';
import { toTaskMcpDto } from '../mapping/task-mcp-dto.js';
import { taskEditInputSchema, taskEditOutputSchema } from '../schemas/mutation-tool-schemas.js';

export function registerTaskEditTool(server: McpServer, application: TaskApplication): void {
  server.registerTool(
    'task_edit',
    {
      description:
        'Edit task metadata only after explicit user direction in the active conversation',
      inputSchema: taskEditInputSchema,
      outputSchema: taskEditOutputSchema,
    },
    async (input) => {
      try {
        const mutation = application.edit({
          id: input.taskId,
          ...(input.title === undefined ? {} : { title: input.title }),
          ...(input.description === undefined
            ? input.clearDescription === true
              ? { description: null }
              : {}
            : { description: input.description }),
          ...(input.priority === undefined
            ? input.clearPriority === true
              ? { priority: null }
              : {}
            : { priority: input.priority }),
          ...(input.workspace === undefined
            ? input.clearWorkspace === true
              ? { workspace: null }
              : {}
            : { workspace: input.workspace }),
          ...(input.sourceContext === undefined
            ? input.clearSourceContext === true
              ? { sourceContext: null }
              : {}
            : { sourceContext: input.sourceContext }),
        });
        return mcpSuccess({
          task: toTaskMcpDto(mutation.task),
          change: editChange(mutation.before, mutation.task),
        });
      } catch (error) {
        return toMcpError(error);
      }
    },
  );
}
