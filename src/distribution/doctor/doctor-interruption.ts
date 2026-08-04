export type DoctorTerminationSignal = 'SIGINT' | 'SIGTERM';

export class DoctorInterruptedError extends Error {
  readonly signal: DoctorTerminationSignal;

  constructor(signal: DoctorTerminationSignal) {
    super(`Relay doctor interrupted by ${signal}.`);
    this.name = 'DoctorInterruptedError';
    this.signal = signal;
    Object.setPrototypeOf(this, new.target.prototype);
  }
}

export function doctorSignalExitCode(signal: DoctorTerminationSignal): 130 | 143 {
  return signal === 'SIGINT' ? 130 : 143;
}
