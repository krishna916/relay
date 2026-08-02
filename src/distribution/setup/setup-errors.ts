import { RelayError } from '../../shared/errors.js';

export class SetupUsageError extends Error {}
export class SetupNotFoundError extends Error {}
export class SetupConflictError extends Error {}
export class SetupStorageError extends RelayError {}
