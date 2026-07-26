import type { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import type { TaskApplication } from '../../../application/tasks/task-application.js';
import { toMcpError } from '../mapping/mcp-errors.js';
import { mcpSuccess } from '../mapping/mcp-result.js';
import { toTaskMcpDto } from '../mapping/task-mcp-dto.js';
import { agentCaptureInputSchema, taskCaptureOutputSchema } from '../schemas/read-tool-schemas.js';

export function registerTaskCaptureTool(server: McpServer, taskApplication: TaskApplication): void {
  server.registerTool(
    'task_capture',
    {
      description: 'Capture an autonomous Relay task',
      inputSchema: agentCaptureInputSchema,
      outputSchema: taskCaptureOutputSchema,
    },
    async (input) => {
      try {
        const parsed = input;
        const matches = taskApplication.findSimilar({
          title: parsed.title,
          ...(parsed.workspace === undefined ? {} : { workspace: parsed.workspace }),
          limit: 5,
        });
        const task = taskApplication.create({
          title: parsed.title,
          ...(parsed.description === undefined ? {} : { description: parsed.description }),
          ...(parsed.priority === undefined ? {} : { priority: parsed.priority }),
          ...(parsed.workspace === undefined ? {} : { workspace: parsed.workspace }),
          ...(parsed.sourceContext === undefined ? {} : { sourceContext: parsed.sourceContext }),
          sessionId: parsed.sessionId,
          creator: { type: 'AGENT', name: parsed.createdByName },
        });
        const warnings =
          matches.length === 0
            ? []
            : [
                {
                  code: 'POSSIBLE_DUPLICATE',
                  message: 'Similar tasks already exist.',
                  candidates: matches.map((candidate) => ({ id: candidate.id })),
                },
              ];
        return mcpSuccess({ task: toTaskMcpDto(task), change: { action: 'CREATED' } }, warnings);
      } catch (error) {
        return toMcpError(error);
      }
    },
  );
}
