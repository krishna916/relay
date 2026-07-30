import { mkdir, mkdtemp, rm } from 'node:fs/promises';
import { existsSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import { pathToFileURL } from 'node:url';
import { Client } from '@modelcontextprotocol/sdk/client/index.js';
import { StdioClientTransport } from '@modelcontextprotocol/sdk/client/stdio.js';
import { assertLinuxBuildTarget, resolveLinuxMcpbPaths } from './model.js';

export interface VerifyLinuxMcpbStageOptions {
  readonly rootDir?: string;
  readonly stageDir?: string;
}
export interface McpbStageVerification {
  readonly runtime: {
    readonly node: string;
    readonly modulesAbi: string;
    readonly platform: NodeJS.Platform;
    readonly arch: NodeJS.Architecture;
  };
  readonly databasePath: string;
  readonly tools: readonly string[];
  readonly health: { readonly name: string; readonly status: string; readonly version: string };
  readonly capturedTask: Readonly<Record<string, unknown>>;
  readonly sessionCount: number;
  readonly stdoutDiagnostics: string;
  readonly stderr: string;
}

export async function verifyLinuxMcpbStage(
  options: VerifyLinuxMcpbStageOptions = {},
): Promise<McpbStageVerification> {
  assertLinuxBuildTarget();
  const rootDir = resolve(options.rootDir ?? process.cwd());
  const stageDir = options.stageDir ?? resolveLinuxMcpbPaths(rootDir).stageDir;
  const serverPath = join(stageDir, 'server', 'main.js');
  if (!existsSync(serverPath))
    throw new Error(`Linux MCPB stage is missing server entry: ${serverPath}`);
  const temporaryRoot = await mkdtemp(join(tmpdir(), 'relay-mcpb-verify-'));
  const databasePath = join(temporaryRoot, 'data', 'relay.db');
  const cwd = join(temporaryRoot, 'cwd');
  await mkdir(cwd, { recursive: true });
  const transport = new StdioClientTransport({
    command: 'node',
    args: [serverPath],
    cwd,
    env: { ...process.env, RELAY_DB_PATH: databasePath },
  });
  const client = new Client({ name: 'relay-mcpb-verifier', version: '1.0.0' });
  try {
    await client.connect(transport);
    const discovered = await client.listTools();
    const healthResult = (await client.callTool({ name: 'relay_health', arguments: {} })) as {
      content: Array<{ type: string; text: string }>;
    };
    const health = JSON.parse(
      healthResult.content[0]?.text ?? '{}',
    ) as McpbStageVerification['health'];
    const captured = (await client.callTool({
      name: 'task_capture',
      arguments: {
        title: 'Verify Linux MCPB stage',
        createdByName: 'Relay MCPB verifier',
        sessionId: 'mcpb-stage-verification',
      },
    })) as { structuredContent?: { data?: { task?: Record<string, unknown> } } };
    const session = (await client.callTool({
      name: 'session_captures_list',
      arguments: { sessionId: 'mcpb-stage-verification' },
    })) as { structuredContent?: { data?: { count?: number } } };
    return {
      runtime: {
        node: process.version,
        modulesAbi: process.versions.modules ?? '',
        platform: process.platform,
        arch: process.arch,
      },
      databasePath,
      tools: discovered.tools.map((tool) => tool.name),
      health,
      capturedTask: captured.structuredContent?.data?.task ?? {},
      sessionCount: session.structuredContent?.data?.count ?? 0,
      stdoutDiagnostics: '',
      stderr: '',
    };
  } finally {
    await transport.close();
    await rm(temporaryRoot, { recursive: true, force: true });
  }
}

if (import.meta.url === pathToFileURL(process.argv[1] ?? '').href) {
  verifyLinuxMcpbStage()
    .then((result) => process.stdout.write(`${JSON.stringify(result)}\n`))
    .catch((error: unknown) => {
      process.stderr.write(`${error instanceof Error ? error.message : String(error)}\n`);
      process.exitCode = 1;
    });
}
