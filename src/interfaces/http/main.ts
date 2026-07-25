import { createHttpServer } from './create-http-server.js';
import { createTaskRuntime } from './create-task-runtime.js';

async function main(): Promise<void> {
  try {
    const runtime = createTaskRuntime();
    let instance;
    try {
      instance = await createHttpServer({ taskApplication: runtime.taskApplication });
    } catch (error) {
      runtime.close();
      throw error;
    }
    process.stderr.write(`[INFO] HTTP server running at ${instance.url}\n`);

    const shutdown = () => {
      process.stderr.write('[INFO] Stopping HTTP server...\n');
      void instance
        .stop()
        .then(() => runtime.close())
        .then(() => process.exit(0))
        .catch((error: unknown) => {
          const msg = error instanceof Error ? error.message : String(error);
          process.stderr.write(`[ERROR] Failed to stop HTTP server cleanly: ${msg}\n`);
          process.exit(1);
        });
    };

    process.on('SIGINT', shutdown);
    process.on('SIGTERM', shutdown);
  } catch (error) {
    const msg = error instanceof Error ? error.message : String(error);
    process.stderr.write(`[ERROR] Fatal HTTP server error: ${msg}\n`);
    process.exit(1);
  }
}

void main();
