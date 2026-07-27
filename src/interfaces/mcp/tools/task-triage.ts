import type { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import type { TaskApplication } from '../../../application/tasks/task-application.js';
import { triageChange } from '../mapping/change-metadata.js';
import { toMcpError } from '../mapping/mcp-errors.js';
import { mcpSuccess } from '../mapping/mcp-result.js';
import { toTaskMcpDto } from '../mapping/task-mcp-dto.js';
import { taskTriageInputSchema, taskTriageOutputSchema } from '../schemas/mutation-tool-schemas.js';

export function registerTaskTriageTool(server: McpServer, application: TaskApplication): void {
  server.registerTool(
    'task_triage',
    {
      description: 'Triage a task only after explicit user direction in the active conversation',
      inputSchema: taskTriageInputSchema,
      outputSchema: taskTriageOutputSchema,
    },
    async (input) => {
      try {
        const mutation =
          input.target === 'INBOX'
            ? application.moveToInbox({ id: input.taskId })
            : input.target === 'ACTIVE'
              ? application.activate({ id: input.taskId })
              : application.moveToBacklog({ id: input.taskId });
        return mcpSuccess({
          task: toTaskMcpDto(mutation.task),
          change: triageChange(mutation.before, mutation.task),
        });
      } catch (error) {
        return toMcpError(error);
      }
    },
  );
}
