import { join } from 'node:path';
import { homedir } from 'node:os';
import { RelayError } from '../shared/errors.js';

export function getDefaultDatabasePath(): string {
  const home = homedir();
  if (process.platform === 'win32') {
    const appData = process.env.APPDATA || join(home, 'AppData', 'Roaming');
    return join(appData, 'relay', 'relay.db');
  }
  if (process.platform === 'darwin') {
    return join(home, 'Library', 'Application Support', 'relay', 'relay.db');
  }
  const xdgData = process.env.XDG_DATA_HOME || join(home, '.local', 'share');
  return join(xdgData, 'relay', 'relay.db');
}

export function resolveDatabasePath(explicitPath?: string): string {
  if (explicitPath !== undefined) {
    if (!explicitPath.trim()) {
      throw new RelayError('Database path cannot be empty or whitespace only.');
    }
    return explicitPath.trim();
  }

  const envPath = process.env.RELAY_DB_PATH;
  if (envPath && envPath.trim()) {
    return envPath.trim();
  }

  return getDefaultDatabasePath();
}
