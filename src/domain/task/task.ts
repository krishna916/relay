import { TaskArchivedError, TaskValidationError } from './task-errors.js';
import { isTaskPriority, type TaskPriority } from './task-priority.js';
import { isTaskStatus, type TaskStatus } from './task-status.js';
import { MAX_SESSION_ID_LENGTH, SESSION_ID_PATTERN } from '../../shared/session-id-rules.js';

const MAX_ID_LENGTH = 100;
const MAX_TITLE_LENGTH = 300;
const MAX_DESCRIPTION_LENGTH = 10_000;
const MAX_WORKSPACE_LENGTH = 255;
const MAX_SOURCE_CONTEXT_LENGTH = 1_000;
const MAX_CREATOR_NAME_LENGTH = 100;

export type TaskCreatorType = 'HUMAN' | 'AGENT';

export interface Task {
  readonly id: string;
  readonly title: string;
  readonly description: string | null;
  readonly status: TaskStatus;
  readonly priority: TaskPriority | null;
  readonly workspace: string | null;
  readonly sourceContext: string | null;
  readonly createdByType: TaskCreatorType;
  readonly createdByName: string | null;
  readonly sessionId: string | null;
  readonly createdAt: string;
  readonly updatedAt: string;
  readonly startedAt: string | null;
  readonly completedAt: string | null;
  readonly archivedAt: string | null;
}

export interface CreateTaskInput {
  readonly id: string;
  readonly title: string;
  readonly description?: string | null;
  readonly priority?: TaskPriority | null;
  readonly workspace?: string | null;
  readonly sourceContext?: string | null;
  readonly createdByType: TaskCreatorType;
  readonly createdByName?: string | null;
  readonly sessionId?: string | null;
}

export interface RehydrateTaskInput {
  readonly id: string;
  readonly title: string;
  readonly description: string | null;
  readonly status: TaskStatus;
  readonly priority: TaskPriority | null;
  readonly workspace: string | null;
  readonly sourceContext: string | null;
  readonly createdByType: TaskCreatorType;
  readonly createdByName: string | null;
  readonly sessionId: string | null;
  readonly createdAt: string;
  readonly updatedAt: string;
  readonly startedAt: string | null;
  readonly completedAt: string | null;
  readonly archivedAt: string | null;
}

export interface TaskChanges {
  readonly title?: string;
  readonly description?: string | null;
  readonly priority?: TaskPriority | null;
  readonly workspace?: string | null;
  readonly sourceContext?: string | null;
}

export function createTask(input: CreateTaskInput, now: string): Task {
  const timestamp = validateTaskTimestamp(now, 'now');
  const createdByType = validateCreatorType(input.createdByType);
  const createdByName = optionalString(
    input.createdByName,
    'createdByName',
    MAX_CREATOR_NAME_LENGTH,
  );
  const sessionId = validateSessionId(input.sessionId);
  validateCreatorSessionConsistency(createdByType, createdByName, sessionId);

  return {
    id: requiredString(input.id, 'id', MAX_ID_LENGTH),
    title: requiredString(input.title, 'title', MAX_TITLE_LENGTH),
    description: optionalString(input.description, 'description', MAX_DESCRIPTION_LENGTH),
    status: 'INBOX',
    priority: validatePriority(input.priority),
    workspace: optionalString(input.workspace, 'workspace', MAX_WORKSPACE_LENGTH),
    sourceContext: optionalString(input.sourceContext, 'sourceContext', MAX_SOURCE_CONTEXT_LENGTH),
    createdByType,
    createdByName,
    sessionId,
    createdAt: timestamp,
    updatedAt: timestamp,
    startedAt: null,
    completedAt: null,
    archivedAt: null,
  };
}

export function rehydrateTask(input: RehydrateTaskInput): Task {
  requireNormalized(input.id, requiredString(input.id, 'id', MAX_ID_LENGTH), 'id');
  requireNormalized(input.title, requiredString(input.title, 'title', MAX_TITLE_LENGTH), 'title');
  requireNormalizedOptional(input.description, 'description', MAX_DESCRIPTION_LENGTH);
  requireNormalizedOptional(input.workspace, 'workspace', MAX_WORKSPACE_LENGTH);
  requireNormalizedOptional(input.sourceContext, 'sourceContext', MAX_SOURCE_CONTEXT_LENGTH);
  requireNormalizedOptional(input.createdByName, 'createdByName', MAX_CREATOR_NAME_LENGTH);
  requireNormalizedOptional(input.sessionId, 'sessionId', MAX_SESSION_ID_LENGTH);

  const createdByType = validateCreatorType(input.createdByType);
  const sessionId = validateSessionId(input.sessionId);
  if (input.sessionId !== sessionId) {
    throw new TaskValidationError('sessionId', 'sessionId must be normalized');
  }
  validateCreatorSessionConsistency(createdByType, input.createdByName, sessionId);
  if (!isTaskStatus(input.status)) {
    throw new TaskValidationError('status', 'status is not supported');
  }
  validatePriority(input.priority);
  validateTaskTimestamp(input.createdAt, 'createdAt');
  validateTaskTimestamp(input.updatedAt, 'updatedAt');
  validateOptionalTimestamp(input.startedAt, 'startedAt');
  validateOptionalTimestamp(input.completedAt, 'completedAt');
  validateOptionalTimestamp(input.archivedAt, 'archivedAt');
  validateLifecycleTimestamps(input);

  return { ...input };
}

function validateSessionId(value: unknown): string | null {
  const sessionId = optionalString(value, 'sessionId', MAX_SESSION_ID_LENGTH);
  if (sessionId !== null && !SESSION_ID_PATTERN.test(sessionId)) {
    throw new TaskValidationError('sessionId', 'sessionId contains unsupported characters');
  }
  return sessionId;
}

function validateCreatorSessionConsistency(
  createdByType: TaskCreatorType,
  createdByName: string | null,
  sessionId: string | null,
): void {
  if (createdByType === 'AGENT') {
    if (createdByName === null) {
      throw new TaskValidationError('createdByName', 'createdByName is required for AGENT tasks');
    }
    if (sessionId === null) {
      throw new TaskValidationError('sessionId', 'sessionId is required for AGENT tasks');
    }
  } else if (sessionId !== null) {
    throw new TaskValidationError('sessionId', 'sessionId is not allowed for HUMAN tasks');
  }
}

export function editTask(task: Task, changes: TaskChanges, now: string): Task {
  if (task.status === 'ARCHIVED') {
    throw new TaskArchivedError('An archived task cannot be edited');
  }
  const timestamp = validateTaskTimestamp(now, 'now');
  const updated = {
    title:
      changes.title === undefined
        ? task.title
        : requiredString(changes.title, 'title', MAX_TITLE_LENGTH),
    description:
      changes.description === undefined
        ? task.description
        : optionalString(changes.description, 'description', MAX_DESCRIPTION_LENGTH),
    priority: changes.priority === undefined ? task.priority : validatePriority(changes.priority),
    workspace:
      changes.workspace === undefined
        ? task.workspace
        : optionalString(changes.workspace, 'workspace', MAX_WORKSPACE_LENGTH),
    sourceContext:
      changes.sourceContext === undefined
        ? task.sourceContext
        : optionalString(changes.sourceContext, 'sourceContext', MAX_SOURCE_CONTEXT_LENGTH),
  };
  if (
    updated.title === task.title &&
    updated.description === task.description &&
    updated.priority === task.priority &&
    updated.workspace === task.workspace &&
    updated.sourceContext === task.sourceContext
  ) {
    return task;
  }
  return { ...task, ...updated, updatedAt: timestamp };
}

function requiredString(value: unknown, field: string, maximumLength: number): string {
  const normalized = optionalString(value, field, maximumLength);
  if (normalized === null) {
    throw new TaskValidationError(field, `${field} is required`);
  }
  return normalized;
}

function optionalString(value: unknown, field: string, maximumLength: number): string | null {
  if (value === null || value === undefined) {
    return null;
  }
  if (typeof value !== 'string') {
    throw new TaskValidationError(field, `${field} must be a string`);
  }
  const normalized = value.trim();
  if (normalized.length === 0) {
    return null;
  }
  if (normalized.length > maximumLength) {
    throw new TaskValidationError(field, `${field} exceeds the maximum length`);
  }
  return normalized;
}

function validatePriority(value: unknown): TaskPriority | null {
  if (value === null || value === undefined) {
    return null;
  }
  if (!isTaskPriority(value)) {
    throw new TaskValidationError('priority', 'priority is not supported');
  }
  return value;
}

function validateCreatorType(value: unknown): TaskCreatorType {
  if (value === 'HUMAN' || value === 'AGENT') {
    return value;
  }
  throw new TaskValidationError('createdByType', 'createdByType is not supported');
}

export function validateTaskTimestamp(value: unknown, field: string): string {
  if (typeof value !== 'string') {
    throw new TaskValidationError(field, `${field} must be an ISO-8601 timestamp`);
  }
  const date = new Date(value);
  if (Number.isNaN(date.getTime()) || date.toISOString() !== value) {
    throw new TaskValidationError(field, `${field} must be a normalized UTC ISO-8601 timestamp`);
  }
  return value;
}

function validateOptionalTimestamp(value: unknown, field: string): string | null {
  if (value === null) {
    return null;
  }
  return validateTaskTimestamp(value, field);
}

function requireNormalized(value: string, normalized: string, field: string): void {
  if (value !== normalized) {
    throw new TaskValidationError(field, `${field} must be normalized`);
  }
}

function requireNormalizedOptional(
  value: string | null,
  field: string,
  maximumLength: number,
): void {
  const normalized = optionalString(value, field, maximumLength);
  if (value !== normalized) {
    throw new TaskValidationError(field, `${field} must be normalized`);
  }
}

function validateLifecycleTimestamps(task: RehydrateTaskInput): void {
  if (task.status === 'IN_PROGRESS' && task.startedAt === null) {
    throw new TaskValidationError('startedAt', 'startedAt is required for an IN_PROGRESS task');
  }
  if (task.status === 'DONE' && task.completedAt === null) {
    throw new TaskValidationError('completedAt', 'completedAt is required for a completed task');
  }
  if (task.status !== 'DONE' && task.status !== 'ARCHIVED' && task.completedAt !== null) {
    throw new TaskValidationError('completedAt', 'completedAt requires DONE or ARCHIVED status');
  }
  if (task.status === 'ARCHIVED' && task.archivedAt === null) {
    throw new TaskValidationError('archivedAt', 'archivedAt is required for an ARCHIVED task');
  }
  if (task.status !== 'ARCHIVED' && task.archivedAt !== null) {
    throw new TaskValidationError('archivedAt', 'archivedAt requires ARCHIVED status');
  }
}
