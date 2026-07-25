import type { HealthStatus } from './health.js';
import { getPackageMetadata } from '../../shared/package-metadata.js';

export function getHealth(): HealthStatus {
  const meta = getPackageMetadata();
  return {
    name: 'relay',
    status: 'ok',
    version: meta.version,
  };
}
