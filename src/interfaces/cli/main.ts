#!/usr/bin/env node
import { runCli } from './run-cli.js';
import { runRelay } from './run-relay.js';
import { createTaskRuntime } from '../shared/create-task-runtime.js';
import {
  createOperationalDependencies,
  runMcpServer,
  runUiServer,
} from '../production-dependencies.js';
import { runOperationalCommand } from './run-operational-command.js';
import { writeOperationalError } from './operational-output.js';

void runRelay(process.argv.slice(2), {
  runTaskCommand: (argv) =>
    runCli(argv, {
      createRuntime: createTaskRuntime,
      stdout: process.stdout,
      stderr: process.stderr,
    }),
  runMcp: runMcpServer,
  runUi: runUiServer,
  runOperationalCommand: async (argv) => {
    try {
      return await runOperationalCommand(
        argv,
        createOperationalDependencies({ stdout: process.stdout, stderr: process.stderr }),
      );
    } catch (error) {
      return writeOperationalError(process.stdout, process.stderr, error);
    }
  },
  stderr: process.stderr,
}).then((exitCode) => {
  process.exitCode = exitCode;
});
