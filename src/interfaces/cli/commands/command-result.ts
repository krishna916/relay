export interface CliCommandResult {
  readonly data: Record<string, unknown>;
  readonly warnings?: readonly unknown[];
}
