import type { TaskRuntime } from '../shared/create-task-runtime.js';
import { executeCliCommand } from './execute-cli-command.js';
import { parseCli } from './parse-cli.js';
import { toCliError } from './output/cli-errors.js';
import { cliFailure, cliSuccess } from './output/cli-result.js';

type Writer = { write(text: string): unknown };
export interface CliDependencies {
  readonly createRuntime: () => TaskRuntime;
  readonly stdout: Writer;
  readonly stderr: Writer;
}

export async function runCli(
  argv: readonly string[],
  dependencies: CliDependencies,
): Promise<number> {
  let command;
  try {
    command = parseCli(argv);
  } catch (error) {
    return writeError(error, dependencies);
  }

  let runtime: TaskRuntime;
  try {
    runtime = dependencies.createRuntime();
  } catch (error) {
    return writeError(error, dependencies, { runtimeCreation: true });
  }

  let result: ReturnType<typeof executeCliCommand> | undefined;
  let executionFailed = false;
  let executionError: unknown;
  try {
    result = executeCliCommand(command, runtime.taskApplication);
  } catch (error) {
    executionFailed = true;
    executionError = error;
  }

  let cleanupFailed = false;
  let cleanupError: unknown;
  try {
    runtime.close();
  } catch (error) {
    cleanupFailed = true;
    cleanupError = error;
  }

  if (executionFailed) {
    return writeError(executionError, dependencies);
  }
  if (cleanupFailed) {
    return writeError(cleanupError, dependencies);
  }

  const { data, warnings = [] } = result!;
  write(dependencies.stdout, cliSuccess(data, warnings));
  return 0;
}

function writeError(
  error: unknown,
  { stdout, stderr }: CliDependencies,
  context?: { readonly runtimeCreation?: boolean },
): number {
  const mapped = toCliError(error, context);
  write(stdout, cliFailure(mapped.code, mapped.message));
  stderr.write(`${mapped.message}\n`);
  return mapped.exitCode;
}

function write(writer: Writer, value: unknown): void {
  writer.write(`${JSON.stringify(value)}\n`);
}
