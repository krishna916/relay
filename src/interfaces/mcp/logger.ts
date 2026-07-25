export const mcpLogger = {
  info(message: string): void {
    process.stderr.write(`[INFO] ${message}\n`);
  },
  error(message: string, error?: unknown): void {
    const detail = error instanceof Error ? `: ${error.message}` : '';
    process.stderr.write(`[ERROR] ${message}${detail}\n`);
  },
};
