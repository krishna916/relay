import { describe, expect, it } from 'vitest';
import { join } from 'node:path';
import { createUiLoopbackCheck } from '../../../../src/distribution/doctor/check-ui.js';

const fixtureDir = join(process.cwd(), 'tests', 'fixtures', 'doctor', 'process');

describe('doctor UI check', () => {
  it('reports a failed installed UI command without exposing child output', async () => {
    let cleaned = false;
    const result = await createUiLoopbackCheck({
      installedCommand: { command: 'missing-relay-command', prefixArgs: [] },
      temporaryRootFactory: async () => ({
        path: process.cwd(),
        cleanup: async () => {
          cleaned = true;
        },
      }),
      fetch: globalThis.fetch,
    }).run();
    expect(result).toMatchObject({ status: 'failure', code: 'ui.start-failed' });
    expect(JSON.stringify(result)).not.toContain('missing-relay-command');
    expect(cleaned).toBe(true);
  });

  it('fails a UI health request that never completes', async () => {
    const result = await createUiLoopbackCheck({
      installedCommand: {
        command: process.execPath,
        prefixArgs: [join(fixtureDir, 'ui-ready-child.mjs')],
      },
      temporaryRootFactory: async () => ({
        path: process.cwd(),
        cleanup: async () => undefined,
      }),
      fetch: () => new Promise<Response>(() => undefined),
      requestTimeoutMs: 10,
    }).run();
    expect(result).toMatchObject({ status: 'failure', code: 'ui.health-timeout' });
  });

  it('fails a UI health body that never completes', async () => {
    const result = await createUiLoopbackCheck({
      installedCommand: {
        command: process.execPath,
        prefixArgs: [join(fixtureDir, 'ui-ready-child.mjs')],
      },
      temporaryRootFactory: async () => ({
        path: process.cwd(),
        cleanup: async () => undefined,
      }),
      fetch: async () =>
        new Response(
          new ReadableStream({
            start(controller) {
              controller.enqueue(new TextEncoder().encode('{"name":"relay"'));
            },
          }),
          { status: 200, headers: { 'content-type': 'application/json' } },
        ),
      requestTimeoutMs: 10,
    }).run();
    expect(result).toMatchObject({ status: 'failure', code: 'ui.health-timeout' });
  });

  it('propagates cancellation while reading the UI health body', async () => {
    const controller = new AbortController();
    const cancellation = new Error('doctor cancelled');
    let resolveFetchStarted: (() => void) | undefined;
    const fetchStarted = new Promise<void>((resolve) => {
      resolveFetchStarted = resolve;
    });
    const result = createUiLoopbackCheck({
      installedCommand: {
        command: process.execPath,
        prefixArgs: [join(fixtureDir, 'ui-ready-child.mjs')],
      },
      temporaryRootFactory: async () => ({
        path: process.cwd(),
        cleanup: async () => undefined,
      }),
      fetch: async (_url, init) => {
        resolveFetchStarted?.();
        const requestSignal = init?.signal;
        return {
          ok: true,
          json: () =>
            new Promise<never>((_resolve, reject) => {
              requestSignal?.addEventListener('abort', () => reject(requestSignal.reason), {
                once: true,
              });
            }),
        } as unknown as Response;
      },
    }).run(controller.signal);

    await fetchStarted;
    controller.abort(cancellation);
    await expect(result).rejects.toBe(cancellation);
  });

  it('rejects a UI readiness URL outside loopback', async () => {
    const result = await createUiLoopbackCheck({
      installedCommand: {
        command: process.execPath,
        prefixArgs: [join(fixtureDir, 'ui-non-loopback-child.mjs')],
      },
      temporaryRootFactory: async () => ({
        path: process.cwd(),
        cleanup: async () => undefined,
      }),
      fetch: globalThis.fetch,
    }).run();
    expect(result).toMatchObject({ status: 'failure', code: 'ui.non-loopback' });
  });

  it('rejects an unexpected UI health response', async () => {
    const result = await createUiLoopbackCheck({
      installedCommand: {
        command: process.execPath,
        prefixArgs: [join(fixtureDir, 'ui-ready-child.mjs')],
      },
      temporaryRootFactory: async () => ({
        path: process.cwd(),
        cleanup: async () => undefined,
      }),
      fetch: async () =>
        new Response(JSON.stringify({ name: 'unexpected', status: 'ok' }), {
          status: 200,
          headers: { 'content-type': 'application/json' },
        }),
    }).run();
    expect(result).toMatchObject({ status: 'failure', code: 'ui.health-invalid' });
  });
});
