import type { ChildProcess } from 'node:child_process';
import { writeFileSync } from 'node:fs';
import { join } from 'node:path';
import {
  DOCTOR_UI_TIMEOUT_MS,
  registerDoctorTemporaryRoot,
  runChildProcessProbe,
  terminateDoctorChild,
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
    run: async (signal) => {
      const root = await input.temporaryRootFactory();
      const registeredRoot = registerDoctorTemporaryRoot(root);
      let probe: Promise<Awaited<ReturnType<typeof runChildProcessProbe>>> | undefined;
      let probeChild: ChildProcess | undefined;
      try {
        let resolveReady: ((url: string) => void) | undefined;
        let readinessBuffer = '';
        const ready = new Promise<string>((resolve) => {
          resolveReady = resolve;
        });
        probe = runChildProcessProbe({
          command: input.installedCommand.command,
          args: [...input.installedCommand.prefixArgs, 'ui'],
          cwd: root.path,
          env: {
            ...process.env,
            RELAY_DB_PATH: join(root.path, 'relay.db'),
            RELAY_HTTP_PORT: '0',
          },
          timeoutMs: DOCTOR_UI_TIMEOUT_MS,
          maxCaptureBytes: 32_768,
          ...(signal === undefined ? {} : { signal }),
          onSpawn: (child: ChildProcess) => {
            probeChild = child;
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
        const {
          response: health,
          controller,
          cleanup: cleanupHealth,
        } = await fetchHealth(
          input.fetch,
          `${url}/api/health`,
          input.requestTimeoutMs ?? DOCTOR_UI_REQUEST_TIMEOUT_MS,
          signal,
        );
        try {
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
            if (signal?.aborted) throw signal.reason;
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
        } finally {
          cleanupHealth();
        }
      } catch (error) {
        if (signal?.aborted) throw signal.reason;
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
        if (probeChild !== undefined) await terminateDoctorChild(probeChild).catch(() => undefined);
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
  signal?: AbortSignal,
): Promise<{ response: Response; controller: AbortController; cleanup: () => void }> {
  const controller = new AbortController();
  const abort = (): void => controller.abort(signal?.reason);
  const cleanup = (): void => signal?.removeEventListener('abort', abort);
  if (signal?.aborted) abort();
  else signal?.addEventListener('abort', abort, { once: true });
  let timer: NodeJS.Timeout | undefined;
  let responseReceived = false;
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
    responseReceived = true;
    return { response, controller, cleanup };
  } finally {
    if (timer !== undefined) clearTimeout(timer);
    if (!responseReceived) cleanup();
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
