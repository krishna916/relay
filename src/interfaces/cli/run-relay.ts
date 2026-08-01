export interface RelayCommandDependencies {
  readonly runTaskCommand: (argv: readonly string[]) => Promise<number>;
  readonly runMcp: () => Promise<number | void>;
  readonly runUi: () => Promise<number | void>;
  readonly stderr: { write(text: string): unknown };
}

export async function runRelay(
  argv: readonly string[],
  dependencies: RelayCommandDependencies,
): Promise<number> {
  const command = argv[0];
  if (command === 'mcp') return (await dependencies.runMcp()) ?? 0;
  if (command === 'ui') return (await dependencies.runUi()) ?? 0;
  if (command === 'task' || command === 'session') return dependencies.runTaskCommand(argv);
  dependencies.stderr.write('Unknown or missing command.\n');
  return 2;
}
