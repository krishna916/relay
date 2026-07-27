import type { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import type { TaskApplication } from '../../../application/tasks/task-application.js';
import { editChange } from '../../contracts/change-metadata.js';
import { toMcpError } from '../mapping/mcp-errors.js';
import { mcpSuccess } from '../mapping/mcp-result.js';
import { toTaskDto } from '../../contracts/task-dto.js';
import { taskEditInputSchema, taskEditOutputSchema } from '../schemas/mutation-tool-schemas.js';

const fieldUpdate = <K extends string, V>(
  field: K,
  value: V | undefined,
  clear: boolean | undefined,
) => (value === undefined ? (clear === true ? { [field]: null } : {}) : { [field]: value });

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
        const mutation = await application.edit({
          id: input.taskId,
          ...(input.title === undefined ? {} : { title: input.title }),
          ...fieldUpdate('description', input.description, input.clearDescription),
          ...fieldUpdate('priority', input.priority, input.clearPriority),
          ...fieldUpdate('workspace', input.workspace, input.clearWorkspace),
          ...fieldUpdate('sourceContext', input.sourceContext, input.clearSourceContext),
        });
        return mcpSuccess({
          task: toTaskDto(mutation.task),
          change: editChange(mutation.before, mutation.task),
        });
      } catch (error) {
        return toMcpError(error);
      }
    },
  );
}
