import type { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import type { TaskApplication } from '../../../application/tasks/task-application.js';
import { registerTaskArchiveTool } from './task-archive.js';
import { registerTaskCompleteTool } from './task-complete.js';
import { registerTaskEditTool } from './task-edit.js';
import { registerTaskStartTool } from './task-start.js';
import { registerTaskTriageTool } from './task-triage.js';

export function registerMutationTools(server: McpServer, application: TaskApplication): void {
  registerTaskEditTool(server, application);
  registerTaskTriageTool(server, application);
  registerTaskStartTool(server, application);
  registerTaskCompleteTool(server, application);
  registerTaskArchiveTool(server, application);
}
