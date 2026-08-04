import {
  cleanupDoctorChildren,
  installDoctorSignalHandlers,
  type DoctorSignalRegistration,
} from '../../distribution/doctor/child-process-probe.js';
import {
  doctorSignalExitCode,
  DoctorInterruptedError,
} from '../../distribution/doctor/doctor-interruption.js';
import { runDoctor } from '../../distribution/doctor/run-doctor.js';
import type { DoctorCheck, DoctorReport } from '../../distribution/doctor/doctor-types.js';
import { writeDoctorReport } from './doctor-output.js';
import { parseDoctorCommand } from './parse-doctor-command.js';

type Writer = { write(text: string): unknown };

export interface DoctorCommandDependencies {
  readonly applicationVersion: string;
  readonly createChecks: () => readonly DoctorCheck[];
  readonly now: () => Date;
  readonly monotonicNow: () => number;
  readonly stdout: Writer;
  readonly stderr: Writer;
  readonly installSignalHandlers?: (input: {
    readonly controller: AbortController;
  }) => DoctorSignalRegistration;
}

export async function runDoctorCommand(
  argv: readonly string[],
  dependencies: DoctorCommandDependencies,
): Promise<number> {
  let command;
  try {
    command = parseDoctorCommand(argv);
  } catch (error) {
    dependencies.stderr.write(
      `${error instanceof Error ? error.message : 'Invalid doctor command.'}\n`,
    );
    return 2;
  }

  const controller = new AbortController();
  const registration = (dependencies.installSignalHandlers ?? installDoctorSignalHandlers)({
    controller,
  });
  try {
    const report: DoctorReport = await runDoctor({
      context: {
        applicationVersion: dependencies.applicationVersion,
        now: dependencies.now,
        monotonicNow: dependencies.monotonicNow,
      },
      checks: dependencies.createChecks(),
      signal: controller.signal,
    });
    writeDoctorReport(dependencies.stdout, report, command.output);
    return report.summary.failure > 0 ? 1 : 0;
  } catch (error) {
    if (error instanceof DoctorInterruptedError) {
      await registration.cleanupStarted();
      return doctorSignalExitCode(error.signal);
    }
    dependencies.stderr.write('The doctor command could not complete safely.\n');
    return 1;
  } finally {
    await cleanupDoctorChildren();
    registration.remove();
  }
}
