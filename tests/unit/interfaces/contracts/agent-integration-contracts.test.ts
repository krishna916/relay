import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import { CONTRACT_SCHEMA_VERSION } from '../../../../src/interfaces/contracts/contract-version.js';
import {
  CONTRACT_ERROR_CODES,
  contractErrorSchema,
  errorCodeToExitCode,
} from '../../../../src/interfaces/contracts/error-contract.js';
import {
  agentCaptureInputSchema,
  findSimilarInputSchema,
  mutationInputSchema,
  taskArchiveInputSchema,
  taskCaptureResultSchema,
  taskCompleteInputSchema,
  taskDtoSchema,
  taskEditInputSchema,
  taskGetInputSchema,
  taskListInputSchema,
  taskStartInputSchema,
  taskStartResultSchema,
  taskTriageInputSchema,
} from '../../../../src/interfaces/contracts/task-contract.js';
import {
  parseSessionId,
  sessionCapturesInputSchema,
} from '../../../../src/interfaces/contracts/session-contract.js';
import {
  cliErrorEnvelopeSchema,
  cliSuccessEnvelopeSchema,
  duplicateWarningSchema,
} from '../../../../src/interfaces/contracts/warning-contract.js';

const FIXTURE_DIRECTORY = join(process.cwd(), 'tests', 'fixtures', 'contracts');
const VALID_TASK = {
  id: 'task-1',
  title: 'Capture',
  description: null,
  status: 'INBOX',
  priority: null,
  workspace: null,
  sourceContext: null,
  createdByType: 'AGENT',
  createdByName: 'Relay agent',
  sessionId: 'session-1',
  createdAt: '2026-07-26T00:00:00.000Z',
  updatedAt: '2026-07-26T00:00:00.000Z',
  startedAt: null,
  completedAt: null,
  archivedAt: null,
};

describe('agent integration contracts', () => {
  it('uses schema version one and maps every stable error to the documented exit code', () => {
    expect(CONTRACT_SCHEMA_VERSION).toBe(1);
    expect(CONTRACT_ERROR_CODES).toEqual([
      'VALIDATION_ERROR',
      'NOT_FOUND',
      'CONFLICT',
      'ARCHIVED_TASK',
      'STORAGE_ERROR',
      'INTERNAL_ERROR',
    ]);
    expect(
      Object.fromEntries(CONTRACT_ERROR_CODES.map((code) => [code, errorCodeToExitCode(code)])),
    ).toEqual({
      VALIDATION_ERROR: 2,
      NOT_FOUND: 3,
      CONFLICT: 4,
      ARCHIVED_TASK: 4,
      STORAGE_ERROR: 5,
      INTERNAL_ERROR: 1,
    });
  });

  it.each([
    ['agent:session-1', 'agent:session-1'],
    ['  relay_2026.07-26  ', 'relay_2026.07-26'],
  ])('normalizes valid session identifiers', (value, expected) => {
    expect(parseSessionId(value)).toBe(expected);
  });

  it.each(['', ' ', 'contains/slash', 'emoji-😀', 'a'.repeat(129)])(
    'rejects malformed session identifiers: %j',
    (value) => {
      expect(() => parseSessionId(value)).toThrow(/sessionId/i);
    },
  );

  it('limits list and similar-task requests and exposes only focused mutation inputs', () => {
    expect(taskListInputSchema.safeParse({ limit: 101 }).success).toBe(false);
    expect(taskListInputSchema.safeParse({ limit: 100 }).success).toBe(true);
    expect(sessionCapturesInputSchema.safeParse({ sessionId: 's', limit: 101 }).success).toBe(
      false,
    );
    expect(
      agentCaptureInputSchema.safeParse({
        title: 'Capture',
        createdByName: 'Relay agent',
        sessionId: 'session-1',
        status: 'ACTIVE',
      }).success,
    ).toBe(false);
    expect(
      agentCaptureInputSchema.safeParse({
        title: 'Capture',
        createdByName: 'Relay agent',
        sessionId: 'session-1',
        createdByType: 'HUMAN',
      }).success,
    ).toBe(false);
    expect(findSimilarInputSchema.safeParse({ title: 'Capture', limit: 6 }).success).toBe(false);
    expect(findSimilarInputSchema.parse({ title: 'Capture' }).limit).toBe(5);
    expect(mutationInputSchema.safeParse({ title: 'Edited', sessionId: 'session-1' }).success).toBe(
      false,
    );
    expect(taskEditInputSchema.safeParse({ taskId: 'task-1', title: 'Edited' }).success).toBe(true);
    expect(taskEditInputSchema.safeParse({ title: 'Edited' }).success).toBe(false);
    expect(
      taskEditInputSchema.safeParse({
        taskId: 'task-1',
        description: 'Updated description',
        clearDescription: true,
      }).success,
    ).toBe(false);
    expect(taskEditInputSchema.safeParse({ taskId: 'task-1', description: null }).success).toBe(
      false,
    );
    expect(
      taskEditInputSchema.safeParse({ taskId: 'task-1', clearDescription: true }).success,
    ).toBe(true);
    expect(
      taskTriageInputSchema.safeParse({ taskId: 'task-1', target: 'IN_PROGRESS' }).success,
    ).toBe(false);
    expect(taskTriageInputSchema.safeParse({ taskId: 'task-1', target: 'BACKLOG' }).success).toBe(
      true,
    );
    for (const schema of [
      taskGetInputSchema,
      taskStartInputSchema,
      taskCompleteInputSchema,
      taskArchiveInputSchema,
    ]) {
      expect(schema.safeParse({ taskId: '' }).success).toBe(false);
      expect(schema.safeParse({ taskId: 'task-1' }).success).toBe(true);
    }
  });

  it('validates the public task representation, envelopes, warnings, and committed fixtures', () => {
    expect(
      taskDtoSchema.safeParse({
        id: 'task-1',
        title: 'Capture',
        description: null,
        status: 'INBOX',
        priority: null,
        workspace: null,
        sourceContext: null,
        createdByType: 'AGENT',
        createdByName: 'Relay agent',
        sessionId: 'session-1',
        createdAt: '2026-07-26T00:00:00.000Z',
        updatedAt: '2026-07-26T00:00:00.000Z',
        startedAt: null,
        completedAt: null,
        archivedAt: null,
      }).success,
    ).toBe(true);
    expect(
      taskCaptureResultSchema.safeParse({
        task: {
          id: 'task-1',
          title: 'Capture',
          description: null,
          status: 'INBOX',
          priority: null,
          workspace: null,
          sourceContext: null,
          createdByType: 'AGENT',
          createdByName: 'Relay agent',
          sessionId: 'session-1',
          createdAt: '2026-07-26T00:00:00.000Z',
          updatedAt: '2026-07-26T00:00:00.000Z',
          startedAt: null,
          completedAt: null,
          archivedAt: null,
        },
        change: { action: 'CREATED' },
      }).success,
    ).toBe(true);
    expect(
      taskCaptureResultSchema.safeParse({ task: VALID_TASK, change: { action: 'ARCHIVED' } })
        .success,
    ).toBe(false);
    expect(
      taskStartResultSchema.safeParse({ task: VALID_TASK, change: { action: 'CREATED' } }).success,
    ).toBe(false);
    expect(
      duplicateWarningSchema.safeParse({
        code: 'POSSIBLE_DUPLICATE',
        message: 'Similar task found',
        candidates: [{ id: 'task-1' }],
      }).success,
    ).toBe(true);
    expect(
      cliSuccessEnvelopeSchema.safeParse({
        schemaVersion: 1,
        ok: true,
        data: { task: { id: 'task-1' }, warningCount: 0 },
        warnings: [],
      }).success,
    ).toBe(true);
    expect(
      cliSuccessEnvelopeSchema.safeParse({
        schemaVersion: 1,
        ok: true,
        data: { omitted: undefined },
        warnings: [],
      }).success,
    ).toBe(false);
    expect(
      contractErrorSchema.safeParse({
        code: 'VALIDATION_ERROR',
        message: 'Invalid input',
        details: { receivedAt: new Date() },
      }).success,
    ).toBe(false);

    const captureFixtures = ['capture-success.json', 'capture-duplicate-warning.json'];
    for (const filename of captureFixtures) {
      const fixture = JSON.parse(
        readFileSync(join(FIXTURE_DIRECTORY, filename), 'utf8'),
      ) as unknown;
      const envelope = cliSuccessEnvelopeSchema.parse(fixture);
      expect(taskCaptureResultSchema.parse(envelope.data)).toEqual(envelope.data);
      expect(JSON.stringify(envelope)).not.toBeUndefined();
    }

    const errorFixtures: ReadonlyArray<[string, (value: unknown) => unknown]> = [
      ['validation-error.json', cliErrorEnvelopeSchema.parse],
      ['not-found-error.json', cliErrorEnvelopeSchema.parse],
      ['transition-conflict-error.json', cliErrorEnvelopeSchema.parse],
      ['storage-error.json', cliErrorEnvelopeSchema.parse],
    ];
    for (const [filename, parser] of errorFixtures) {
      const fixture = JSON.parse(
        readFileSync(join(FIXTURE_DIRECTORY, filename), 'utf8'),
      ) as unknown;
      expect(parser(fixture)).toEqual(fixture);
    }
    expect(
      contractErrorSchema.parse({ code: 'NOT_FOUND', message: 'Task was not found.' }),
    ).toEqual({
      code: 'NOT_FOUND',
      message: 'Task was not found.',
    });
  });
});
