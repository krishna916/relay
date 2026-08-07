import { spawn } from 'node:child_process';
const child = spawn(process.execPath, ['-e', 'setInterval(() => undefined, 1000)'], {
  stdio: 'ignore',
});
process.stdout.write(String(child.pid));
setInterval(() => undefined, 1000);
