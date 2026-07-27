import { createTaskRuntime } from '../shared/create-task-runtime.js';
import { runCli } from './run-cli.js';

void runCli(process.argv.slice(2), {
  createRuntime: createTaskRuntime,
  stdout: process.stdout,
  stderr: process.stderr,
}).then((exitCode) => {
  process.exitCode = exitCode;
});
