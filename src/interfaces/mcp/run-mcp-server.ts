import type { TaskApplication } from '../../application/tasks/task-application.js';
import type { TaskRuntime } from '../shared/create-task-runtime.js';

interface McpServerLike {
  connect(transport: unknown): Promise<void>;
  close(): Promise<void>;
}
export interface McpServerDependencies {
  createRuntime: () => TaskRuntime;
  createServer: (taskApplication: TaskApplication) => McpServerLike;
  createTransport: () => unknown;
  onSignal: (signal: 'SIGINT' | 'SIGTERM', handler: () => void) => void;
  reportFatal: (error: unknown) => void;
}

export async function runMcpServer(dependencies: McpServerDependencies): Promise<boolean> {
  let runtime: TaskRuntime | undefined;
  let server: McpServerLike | undefined;
  let shutdown: Promise<void> | undefined;
  const close = (): Promise<void> => {
    shutdown ??= (async () => {
      try {
        await server?.close();
      } finally {
        runtime?.close();
      }
    })();
    return shutdown;
  };
  try {
    runtime = dependencies.createRuntime();
    server = dependencies.createServer(runtime.taskApplication);
    dependencies.onSignal('SIGINT', () => {
      void close().catch(dependencies.reportFatal);
    });
    dependencies.onSignal('SIGTERM', () => {
      void close().catch(dependencies.reportFatal);
    });
    await server.connect(dependencies.createTransport());
    return true;
  } catch (error) {
    try {
      await close();
    } catch (shutdownError) {
      dependencies.reportFatal(shutdownError);
    }
    dependencies.reportFatal(error);
    return false;
  }
}
