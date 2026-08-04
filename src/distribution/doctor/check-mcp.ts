import { Client } from '@modelcontextprotocol/sdk/client/index.js';
import { StdioClientTransport } from '@modelcontextprotocol/sdk/client/stdio.js';
import { registerDoctorCleanup } from './child-process-probe.js';
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
    run: async () => {
      const root = await input.temporaryRootFactory();
      const transport = new StdioClientTransport({
        command: input.installedCommand.command,
        args: [...input.installedCommand.prefixArgs, 'mcp'],
        cwd: root.path,
        env: { ...process.env, RELAY_DB_PATH: joinDatabasePath(root.path) },
        stderr: 'pipe',
      });
      let stderrBytes = 0;
      transport.stderr?.on('data', (chunk: Buffer | string) => {
        const remaining = Math.max(0, 32_768 - stderrBytes);
        stderrBytes += Math.min(remaining, Buffer.byteLength(chunk));
      });
      const unregisterCleanup = registerDoctorCleanup(() => transport.close());
      const client = new Client({ name: 'relay-doctor', version: '1.0.0' });
      try {
        await withTimeout(client.connect(transport), 5_000);
        const tools = (await withTimeout(client.listTools(), 5_000)).tools.map((tool) => tool.name);
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
        unregisterCleanup();
        await client.close().catch(() => undefined);
        await transport.close().catch(() => undefined);
        await root.cleanup();
      }
    },
  };
}

function joinDatabasePath(root: string): string {
  return `${root.replace(/[\\/]$/, '')}/relay.db`;
}

class DoctorTimeout extends Error {}

async function withTimeout<T>(promise: Promise<T>, timeoutMs: number): Promise<T> {
  let timer: NodeJS.Timeout | undefined;
  try {
    return await Promise.race([
      promise,
      new Promise<never>((_, reject) => {
        timer = setTimeout(() => reject(new DoctorTimeout()), timeoutMs);
      }),
    ]);
  } finally {
    if (timer !== undefined) clearTimeout(timer);
  }
}
