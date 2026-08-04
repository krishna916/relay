import { CliUsageError } from './output/cli-errors.js';

export interface DoctorCommand {
  readonly output: 'human' | 'json';
}

export function parseDoctorCommand(argv: readonly string[]): DoctorCommand {
  if (argv[0] !== 'doctor') throw new CliUsageError('Unknown or missing command.');
  if (argv.length === 1) return { output: 'human' };
  if (argv[1] !== '--output')
    throw new CliUsageError(`Unknown doctor option: ${argv[1] ?? ''}`.trim());
  const value = argv[2];
  if (value === undefined || value.startsWith('--'))
    throw new CliUsageError('Missing value for --output.');
  if (value !== 'json') throw new CliUsageError('Unsupported doctor output.');
  if (argv.length > 3) {
    if (argv[3] === '--output')
      throw new CliUsageError('Option --output may be supplied only once.');
    throw new CliUsageError(`Unknown doctor option: ${argv[3]}`);
  }
  return { output: 'json' };
}
