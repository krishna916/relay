import { pathToFileURL } from 'node:url';
import { assertLinuxBuildTarget } from './model.js';

export function assertCurrentLinuxBuildTarget(): void {
  assertLinuxBuildTarget();
}

if (import.meta.url === pathToFileURL(process.argv[1] ?? '').href) {
  try {
    assertCurrentLinuxBuildTarget();
  } catch (error) {
    process.stderr.write(`${error instanceof Error ? error.message : String(error)}\n`);
    process.exitCode = 1;
  }
}
