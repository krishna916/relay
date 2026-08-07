import { Client } from '@modelcontextprotocol/sdk/client/index.js';
import { StdioClientTransport } from '@modelcontextprotocol/sdk/client/stdio.js';
import { writeFileSync } from 'node:fs';
import { join } from 'node:path';
import {
  DOCTOR_MCP_TIMEOUT_MS,
  registerDoctorCleanup,
  registerDoctorTemporaryRoot,
} from './child-process-probe.js';
import type { DoctorCheck } from './doctor-types.js';

export interface InstalledRelayCommand {
  readonly command: string;
  readonly prefixArgs: readonly string[];
}

const REQUIRED_TOOLS = [
  'relay_health',
  'task_capture',
  'task_list',
  'task_get',
  'task_find_similar',
  'session_captures_list',
  'task_edit',
  'task_triage',
  'task_start',
  'task_complete',
  'task_archive',
] as const;

export function resolveInstalledRelayCommand(input: {
  readonly execPath: string;
  readonly argv1: string;
}): InstalledRelayCommand {
  return { command: input.execPath, prefixArgs: [input.argv1] };
}

export function createMcpHandshakeCheck(input: {
  readonly installedCommand: InstalledRelayCommand;
  readonly temporaryRootFactory: () => Promise<{ path: string; cleanup(): Promise<void> }>;
}): DoctorCheck {
  return {
    id: 'mcp.handshake',
    run: async (signal) => {
      const root = await input.temporaryRootFactory();
      const registeredRoot = registerDoctorTemporaryRoot(root);
      const transport = new StdioClientTransport({
        command: input.installedCommand.command,
        args: [...input.installedCommand.prefixArgs, 'mcp'],
        cwd: root.path,
        env: { ...process.env, RELAY_DB_PATH: joinDatabasePath(root.path) },
        stderr: 'pipe',
      });
      const unregisterCleanup = registerDoctorCleanup(() => transport.close());
      const client = new Client({ name: 'relay-doctor', version: '1.0.0' });
      let unregisterHold: (() => void) | undefined;
      const requestOptions = signal === undefined ? undefined : { signal };
      try {
        await withTimeout(client.connect(transport, requestOptions), DOCTOR_MCP_TIMEOUT_MS, signal);
        if (doctorProbeHoldEnabled('mcp')) {
          const marker = process.env.RELAY_DOCTOR_TEST_MARKER;
          if (marker !== undefined) writeFileSync(marker, 'mcp-ready');
          let releaseHold!: () => void;
          const hold = new Promise<void>((resolve) => {
            releaseHold = resolve;
          });
          unregisterHold = registerDoctorCleanup(releaseHold);
          await hold;
        }
        const tools = (
          await withTimeout(client.listTools({}, requestOptions), DOCTOR_MCP_TIMEOUT_MS, signal)
        ).tools.map((tool) => tool.name);
        const missing = REQUIRED_TOOLS.filter((name) => !tools.includes(name));
        if (missing.length > 0) {
          return {
            status: 'failure',
            code: 'mcp.tools-missing',
            message: 'The installed Relay MCP server is missing expected tools.',
            details: { missing },
          };
        }
        return {
          status: 'healthy',
          code: 'mcp.handshake-ok',
          message: 'The installed Relay MCP server initialized and exposed the expected tools.',
          details: { tools: [...REQUIRED_TOOLS] },
        };
      } catch (error) {
        return {
          status: 'failure',
          code: error instanceof DoctorTimeout ? 'mcp.timeout' : 'mcp.spawn-failed',
          message:
            error instanceof DoctorTimeout
              ? 'The installed Relay MCP server did not respond before the timeout.'
              : 'The installed Relay MCP server could not be started safely.',
        };
      } finally {
        unregisterHold?.();
        unregisterCleanup();
        await client.close().catch(() => undefined);
        await transport.close().catch(() => undefined);
        await registeredRoot.cleanup();
      }
    },
  };
}

function doctorProbeHoldEnabled(probe: 'mcp'): boolean {
  return (
    process.env.RELAY_DOCTOR_TEST_HOLD_PROBE === probe &&
    (process.env.NODE_ENV === 'test' || process.env.RELAY_RUN_PACKAGE_SMOKE === '1')
  );
}

function joinDatabasePath(root: string): string {
  return join(root, 'relay.db');
}

class DoctorTimeout extends Error {}

async function withTimeout<T>(
  promise: Promise<T>,
  timeoutMs: number,
  signal?: AbortSignal,
): Promise<T> {
  let timer: NodeJS.Timeout | undefined;
  let abort: (() => void) | undefined;
  const aborted =
    signal === undefined
      ? undefined
      : new Promise<never>((_, reject) => {
          abort = () => reject(signal.reason ?? new Error('Doctor check aborted.'));
          if (signal.aborted) abort();
          else signal.addEventListener('abort', abort, { once: true });
        });
  try {
    return await Promise.race([
      promise,
      new Promise<never>((_, reject) => {
        timer = setTimeout(() => reject(new DoctorTimeout()), timeoutMs);
      }),
      ...(aborted === undefined ? [] : [aborted]),
    ]);
  } finally {
    if (timer !== undefined) clearTimeout(timer);
    if (signal !== undefined && abort !== undefined) signal.removeEventListener('abort', abort);
  }
}
