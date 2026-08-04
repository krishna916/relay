#!/usr/bin/env node
import { runCli } from './run-cli.js';
import { runRelay } from './run-relay.js';
import {
  createOperationalDependencies,
  createDoctorDependencies,
  runMcpServer,
  runUiServer,
} from '../production-dependencies.js';
import { runDoctorCommand } from './run-doctor-command.js';
import { parseDoctorCommand } from './parse-doctor-command.js';
import { writeDoctorBootstrapFailure } from './doctor-output.js';
import { runOperationalCommand } from './run-operational-command.js';
import { writeOperationalError } from './operational-output.js';

void runRelay(process.argv.slice(2), {
  runTaskCommand: async (argv) => {
    const { createTaskRuntime } = await import('../shared/create-task-runtime.js');
    return runCli(argv, {
      createRuntime: createTaskRuntime,
      stdout: process.stdout,
      stderr: process.stderr,
    });
  },
  runMcp: runMcpServer,
  runUi: runUiServer,
  runDoctor: (argv) => {
    let command;
    try {
      command = parseDoctorCommand(argv);
    } catch (error) {
      process.stderr.write(
        `${error instanceof Error ? error.message : 'Invalid doctor command.'}\n`,
      );
      return Promise.resolve(2);
    }
    try {
      return runDoctorCommand(
        argv,
        createDoctorDependencies({ stdout: process.stdout, stderr: process.stderr }),
      ).catch(() => {
        writeDoctorBootstrapFailure(process.stdout, command.output);
        return 1;
      });
    } catch {
      writeDoctorBootstrapFailure(process.stdout, command?.output ?? 'human');
      return Promise.resolve(1);
    }
  },
  runOperationalCommand: async (argv) => {
    try {
      const { createTaskRuntime } = await import('../shared/create-task-runtime.js');
      return await runOperationalCommand(
        argv,
        createOperationalDependencies(
          { stdout: process.stdout, stderr: process.stderr },
          (databasePath) => createTaskRuntime({ databasePath }),
        ),
      );
    } catch (error) {
      return writeOperationalError(process.stdout, process.stderr, error);
    }
  },
  stderr: process.stderr,
}).then((exitCode) => {
  process.exitCode = exitCode;
});
