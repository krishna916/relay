#!/usr/bin/env node
import { runCli } from './run-cli.js';
import { runRelay } from './run-relay.js';
import { createTaskRuntime } from '../shared/create-task-runtime.js';
import { runMcpServer, runUiServer } from '../production-dependencies.js';

void runRelay(process.argv.slice(2), {
  runTaskCommand: (argv) =>
    runCli(argv, {
      createRuntime: createTaskRuntime,
      stdout: process.stdout,
      stderr: process.stderr,
    }),
  runMcp: runMcpServer,
  runUi: runUiServer,
  stderr: process.stderr,
}).then((exitCode) => {
  process.exitCode = exitCode;
});
