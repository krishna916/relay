import type { ChildProcess } from 'node:child_process';
import { writeFileSync } from 'node:fs';
import { createServer } from 'node:net';
import { join } from 'node:path';
import {
  cleanupDoctorChildren,
  DOCTOR_UI_TIMEOUT_MS,
  registerDoctorTemporaryRoot,
  runChildProcessProbe,
} from './child-process-probe.js';
import type { InstalledRelayCommand } from './check-mcp.js';
import type { DoctorCheck } from './doctor-types.js';

export const DOCTOR_UI_REQUEST_TIMEOUT_MS = 3_000;

export function createUiLoopbackCheck(input: {
  readonly installedCommand: InstalledRelayCommand;
  readonly temporaryRootFactory: () => Promise<{ path: string; cleanup(): Promise<void> }>;
  readonly fetch: typeof globalThis.fetch;
  readonly requestTimeoutMs?: number;
}): DoctorCheck {
  return {
    id: 'ui.loopback',
    run: async () => {
      const root = await input.temporaryRootFactory();
      const registeredRoot = registerDoctorTemporaryRoot(root);
      let probe: Promise<Awaited<ReturnType<typeof runChildProcessProbe>>> | undefined;
      try {
        let resolveReady: ((url: string) => void) | undefined;
        let readinessBuffer = '';
        const ready = new Promise<string>((resolve) => {
          resolveReady = resolve;
        });
        const port = await findFreePort();
        probe = runChildProcessProbe({
          command: input.installedCommand.command,
          args: [...input.installedCommand.prefixArgs, 'ui'],
          cwd: root.path,
          env: {
            ...process.env,
            RELAY_DB_PATH: join(root.path, 'relay.db'),
            RELAY_HTTP_PORT: String(port),
          },
          timeoutMs: DOCTOR_UI_TIMEOUT_MS,
          maxCaptureBytes: 32_768,
          onSpawn: (child: ChildProcess) => {
            if (doctorProbeTestEnabled()) {
              const marker = process.env.RELAY_DOCTOR_TEST_UI_MARKER;
              if (marker !== undefined) writeFileSync(marker, 'ui-started');
            }
            child.stderr?.on('data', (chunk: Buffer | string) => {
              readinessBuffer = `${readinessBuffer}${chunk.toString()}`.slice(-32_768);
              const match = /\[INFO\] HTTP server running at (https?:\/\/[^\s]+)/.exec(
                readinessBuffer,
              );
              if (match?.[1]) resolveReady?.(match[1]);
            });
          },
        });
        const url = await Promise.race([
          ready,
          probe.then(() => {
            throw new Error('UI exited before readiness.');
          }),
        ]);
        const parsed = new URL(url);
        if (!['127.0.0.1', 'localhost', '::1'].includes(parsed.hostname)) {
          return {
            status: 'failure',
            code: 'ui.non-loopback',
            message: 'The Relay UI reported a non-loopback address.',
          };
        }
        const { response: health, controller } = await fetchHealth(
          input.fetch,
          `${url}/api/health`,
          input.requestTimeoutMs ?? DOCTOR_UI_REQUEST_TIMEOUT_MS,
        );
        if (!health.ok)
          return {
            status: 'failure',
            code: 'ui.health-failed',
            message: 'The Relay UI health endpoint did not return success.',
          };
        let healthBody: { name?: unknown; status?: unknown };
        try {
          healthBody = (await readHealthBody(
            health,
            controller,
            input.requestTimeoutMs ?? DOCTOR_UI_REQUEST_TIMEOUT_MS,
          )) as { name?: unknown; status?: unknown };
        } catch (error) {
          if (error instanceof UiHealthTimeout) throw error;
          return {
            status: 'failure',
            code: 'ui.health-invalid',
            message: 'The Relay UI health endpoint returned an unexpected response.',
          };
        }
        if (healthBody.name !== 'relay' || healthBody.status !== 'ok') {
          return {
            status: 'failure',
            code: 'ui.health-invalid',
            message: 'The Relay UI health endpoint returned an unexpected response.',
          };
        }
        return {
          status: 'healthy',
          code: 'ui.loopback-ok',
          message: 'The installed Relay UI started on loopback and passed its health check.',
        };
      } catch (error) {
        if (error instanceof UiHealthTimeout) {
          return {
            status: 'failure',
            code: 'ui.health-timeout',
            message: 'The Relay UI health endpoint did not respond before the timeout.',
          };
        }
        return {
          status: 'failure',
          code: 'ui.start-failed',
          message: 'The installed Relay UI could not be started or reached safely.',
        };
      } finally {
        await cleanupDoctorChildren();
        await probe?.catch(() => undefined);
        await registeredRoot.cleanup();
      }
    },
  };
}

function doctorProbeTestEnabled(): boolean {
  return process.env.NODE_ENV === 'test' || process.env.RELAY_RUN_PACKAGE_SMOKE === '1';
}

class UiHealthTimeout extends Error {}

async function fetchHealth(
  fetch: typeof globalThis.fetch,
  url: string,
  timeoutMs: number,
): Promise<{ response: Response; controller: AbortController }> {
  const controller = new AbortController();
  let timer: NodeJS.Timeout | undefined;
  try {
    const response = await Promise.race([
      fetch(url, { signal: controller.signal }),
      new Promise<never>((_, reject) => {
        timer = setTimeout(() => {
          controller.abort();
          reject(new UiHealthTimeout());
        }, timeoutMs);
      }),
    ]);
    return { response, controller };
  } finally {
    if (timer !== undefined) clearTimeout(timer);
  }
}

async function readHealthBody(
  response: Response,
  controller: AbortController,
  timeoutMs: number,
): Promise<unknown> {
  let timer: NodeJS.Timeout | undefined;
  try {
    return await Promise.race([
      response.json(),
      new Promise<never>((_, reject) => {
        timer = setTimeout(() => {
          controller.abort();
          reject(new UiHealthTimeout());
        }, timeoutMs);
      }),
    ]);
  } finally {
    if (timer !== undefined) clearTimeout(timer);
  }
}

async function findFreePort(): Promise<number> {
  const server = createServer();
  await new Promise<void>((resolve, reject) => {
    server.once('error', reject);
    server.listen(0, '127.0.0.1', () => resolve());
  });
  const address = server.address();
  const port = typeof address === 'object' && address !== null ? address.port : undefined;
  await new Promise<void>((resolve, reject) =>
    server.close((error) => (error ? reject(error) : resolve())),
  );
  if (port === undefined) throw new Error('Could not allocate a loopback port.');
  return port;
}
