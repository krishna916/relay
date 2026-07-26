import { describe, expect, it, vi } from 'vitest';
import type { TaskApplication } from '../../../../src/application/tasks/task-application.js';
import { runMcpServer } from '../../../../src/interfaces/mcp/run-mcp-server.js';

describe('runMcpServer', () => {
  it('closes server before runtime exactly once after repeated signals', async () => {
    const events: string[] = [];
    let signal: (() => void) | undefined;
    const runtime = {
      taskApplication: {} as TaskApplication,
      close: vi.fn(() => events.push('runtime.close')),
    };
    const server = {
      connect: vi.fn(async () => {}),
      close: vi.fn(async () => {
        events.push('server.close');
      }),
    };
    await runMcpServer({
      createRuntime: () => runtime,
      createServer: () => server,
      createTransport: () => ({}),
      onSignal: (_name, handler) => {
        signal = handler;
      },
      reportFatal: vi.fn(),
    });
    signal?.();
    signal?.();
    await vi.waitFor(() => expect(runtime.close).toHaveBeenCalledOnce());
    expect(server.close).toHaveBeenCalledOnce();
    expect(events).toEqual(['server.close', 'runtime.close']);
  });

  it('reports a failed connect as a non-zero startup outcome after closing in order', async () => {
    const events: string[] = [];
    const connectFailure = new Error('connect failed');
    const runtime = {
      taskApplication: {} as TaskApplication,
      close: vi.fn(() => {
        events.push('runtime.close');
      }),
    };
    const server = {
      connect: vi.fn(async () => {
        throw connectFailure;
      }),
      close: vi.fn(async () => {
        events.push('server.close');
      }),
    };
    const reportFatal = vi.fn();

    const started = await runMcpServer({
      createRuntime: () => runtime,
      createServer: () => server,
      createTransport: () => ({}),
      onSignal: vi.fn(),
      reportFatal,
    });

    expect(started).toBe(false);
    expect(reportFatal).toHaveBeenCalledWith(connectFailure);
    expect(events).toEqual(['server.close', 'runtime.close']);
  });

  it('closes the runtime when server creation fails', async () => {
    const runtime = { taskApplication: {} as TaskApplication, close: vi.fn() };
    const creationFailure = new Error('server creation failed');
    const reportFatal = vi.fn();

    const started = await runMcpServer({
      createRuntime: () => runtime,
      createServer: () => {
        throw creationFailure;
      },
      createTransport: () => ({}),
      onSignal: vi.fn(),
      reportFatal,
    });

    expect(started).toBe(false);
    expect(runtime.close).toHaveBeenCalledOnce();
    expect(reportFatal).toHaveBeenCalledWith(creationFailure);
  });

  it('still closes the runtime when server shutdown fails', async () => {
    let signal: (() => void) | undefined;
    const serverCloseFailure = new Error('server close failed');
    const runtime = { taskApplication: {} as TaskApplication, close: vi.fn() };
    const server = {
      connect: vi.fn(async () => {}),
      close: vi.fn(async () => {
        throw serverCloseFailure;
      }),
    };
    const reportFatal = vi.fn();
    await runMcpServer({
      createRuntime: () => runtime,
      createServer: () => server,
      createTransport: () => ({}),
      onSignal: (_name, handler) => {
        signal = handler;
      },
      reportFatal,
    });

    signal?.();
    await vi.waitFor(() => expect(runtime.close).toHaveBeenCalledOnce());
    expect(server.close).toHaveBeenCalledOnce();
    expect(reportFatal).toHaveBeenCalledWith(serverCloseFailure);
  });
});
