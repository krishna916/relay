import { beforeEach, describe, expect, it, vi } from 'vitest';
import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { App } from './App.js';
import * as healthClient from './api/health-client.js';
import * as taskClient from './api/task-client.js';

const task = {
  id: 'task-1',
  title: 'Ship UI',
  description: 'Build the sidecar.',
  status: 'ACTIVE' as const,
  priority: 'HIGH' as const,
  workspace: 'relay',
  sourceContext: 'issue-9',
  createdByType: 'HUMAN' as const,
  createdByName: null,
  createdAt: '2026-07-25T10:00:00.000Z',
  updatedAt: '2026-07-25T10:01:00.000Z',
  startedAt: null,
  completedAt: null,
  archivedAt: null,
};

beforeEach(() => {
  vi.restoreAllMocks();
  vi.spyOn(healthClient, 'fetchHealth').mockResolvedValue({
    name: 'relay',
    status: 'ok',
    version: '0.1.0',
  });
  vi.spyOn(taskClient, 'listTasks').mockResolvedValue([task]);
  vi.spyOn(taskClient, 'createTask');
  vi.spyOn(taskClient, 'editTask');
  vi.spyOn(taskClient, 'archiveTask');
});

describe('App', () => {
  it('loads Active by default, navigates views, and selects a task', async () => {
    render(<App />);
    expect(screen.getByText('Loading tasks…')).toBeDefined();
    await screen.findByRole('button', { name: 'Open Ship UI' });
    expect(screen.getByRole('button', { name: 'Active' }).getAttribute('aria-current')).toBe(
      'page',
    );
    fireEvent.click(screen.getByRole('button', { name: 'Open Ship UI' }));
    expect(screen.getByRole('heading', { name: 'Ship UI' })).toBeDefined();
    expect(screen.getAllByText('ACTIVE').length).toBeGreaterThan(0);
    fireEvent.click(screen.getByRole('button', { name: 'Backlog' }));
    await waitFor(() =>
      expect(taskClient.listTasks).toHaveBeenCalledWith(
        'backlog',
        undefined,
        expect.any(AbortSignal),
      ),
    );
  });

  it('shows empty, service-unavailable, and retry states', async () => {
    vi.mocked(taskClient.listTasks)
      .mockRejectedValueOnce(new Error('Connection refused'))
      .mockResolvedValueOnce([]);
    vi.mocked(healthClient.fetchHealth).mockRejectedValueOnce(new Error('Connection refused'));
    render(<App />);
    await screen.findByText('Unable to load tasks.');
    expect(screen.getByText('Relay service unavailable')).toBeDefined();
    fireEvent.click(screen.getAllByRole('button', { name: 'Retry' })[0]!);
    await screen.findByText('No active work.');
  });

  it('creates into Inbox and preserves validation input after failure', async () => {
    const inboxTask = { ...task, id: 'task-2', title: 'Captured', status: 'INBOX' as const };
    vi.mocked(taskClient.createTask)
      .mockRejectedValueOnce(
        new taskClient.RelayApiError(400, 'INVALID', 'Title is required.', {
          title: ['Title is required.'],
        }),
      )
      .mockResolvedValueOnce(inboxTask);
    render(<App />);
    await screen.findByRole('button', { name: 'Open Ship UI' });
    const title = screen.getByLabelText('Title');
    fireEvent.change(title, { target: { value: 'Captured' } });
    fireEvent.click(screen.getByRole('button', { name: 'Create task' }));
    await screen.findByText('Title is required.');
    expect((title as HTMLInputElement).value).toBe('Captured');
    fireEvent.click(screen.getByRole('button', { name: 'Create task' }));
    await waitFor(() => expect(taskClient.createTask).toHaveBeenCalledTimes(2));
    await waitFor(() =>
      expect(taskClient.listTasks).toHaveBeenCalledWith(
        'inbox',
        undefined,
        expect.any(AbortSignal),
      ),
    );
  });

  it('edits a task and requires explicit archive confirmation', async () => {
    vi.mocked(taskClient.editTask).mockResolvedValue({ ...task, title: 'Updated' });
    vi.mocked(taskClient.archiveTask).mockResolvedValue({
      ...task,
      status: 'ARCHIVED',
      archivedAt: '2026-07-25T10:02:00.000Z',
    });
    render(<App />);
    fireEvent.click(await screen.findByRole('button', { name: 'Open Ship UI' }));
    fireEvent.click(screen.getByRole('button', { name: 'Edit task' }));
    fireEvent.change(screen.getAllByLabelText('Title')[1]!, { target: { value: 'Updated' } });
    fireEvent.click(screen.getByRole('button', { name: 'Save changes' }));
    await screen.findByRole('heading', { name: 'Updated' });
    fireEvent.click(screen.getByRole('button', { name: 'Archive' }));
    expect(taskClient.archiveTask).not.toHaveBeenCalled();
    fireEvent.click(screen.getByRole('button', { name: 'Confirm archive' }));
    await waitFor(() => expect(taskClient.archiveTask).toHaveBeenCalledWith('task-1'));
  });

  it('keeps an edit draft visible after a validation failure', async () => {
    vi.mocked(taskClient.editTask).mockRejectedValue(
      new taskClient.RelayApiError(400, 'INVALID', 'Title is required.', {
        title: ['Title is required.'],
      }),
    );
    render(<App />);
    fireEvent.click(await screen.findByRole('button', { name: 'Open Ship UI' }));
    fireEvent.click(screen.getByRole('button', { name: 'Edit task' }));
    const title = screen.getAllByLabelText('Title')[1]!;
    fireEvent.change(title, { target: { value: 'Invalid title' } });
    fireEvent.click(screen.getByRole('button', { name: 'Save changes' }));

    await screen.findByText('Title is required.');
    expect(screen.getByRole('button', { name: 'Save changes' })).toBeDefined();
    expect((screen.getAllByLabelText('Title')[1] as HTMLInputElement).value).toBe('Invalid title');
  });

  it('confirms before discarding a dirty edit when another task is selected', async () => {
    const second = { ...task, id: 'task-2', title: 'Second task' };
    vi.mocked(taskClient.listTasks).mockResolvedValue([task, second]);
    render(<App />);
    fireEvent.click(await screen.findByRole('button', { name: 'Open Ship UI' }));
    fireEvent.click(screen.getByRole('button', { name: 'Edit task' }));
    fireEvent.change(screen.getAllByLabelText('Title')[1]!, { target: { value: 'Changed' } });
    fireEvent.click(screen.getByRole('button', { name: 'Open Second task' }));

    expect(screen.getByText('Discard unsaved changes?')).toBeDefined();
    expect(screen.getByRole('heading', { name: 'Ship UI' })).toBeDefined();
    fireEvent.click(screen.getByRole('button', { name: 'Discard changes' }));
    expect(screen.getByRole('heading', { name: 'Second task' })).toBeDefined();
  });

  it('shows all read-only provenance and lifecycle fields', async () => {
    const detailed = {
      ...task,
      createdByName: 'Krishna',
      startedAt: '2026-07-25T10:02:00.000Z',
      completedAt: '2026-07-25T10:03:00.000Z',
      archivedAt: '2026-07-25T10:04:00.000Z',
    };
    vi.mocked(taskClient.listTasks).mockResolvedValue([detailed]);
    render(<App />);
    fireEvent.click(await screen.findByRole('button', { name: 'Open Ship UI' }));

    for (const label of [
      'Task ID',
      'Created',
      'Updated',
      'Started',
      'Completed',
      'Archived',
      'Created by',
    ])
      expect(screen.getAllByText(label, { exact: true }).length).toBeGreaterThan(0);
    expect(screen.getByText('HUMAN (Krishna)')).toBeDefined();
  });

  it.each([
    ['INBOX', ['Activate', 'Move to backlog']],
    ['ACTIVE', ['Move to inbox', 'Start', 'Move to backlog', 'Complete']],
    ['IN_PROGRESS', ['Return to active', 'Move to backlog', 'Complete']],
    ['BACKLOG', ['Move to inbox', 'Activate']],
    ['DONE', []],
  ] as const)('renders only valid lifecycle actions for %s', async (status, actions) => {
    vi.mocked(taskClient.listTasks).mockResolvedValue([{ ...task, status }]);
    render(<App />);
    fireEvent.click(await screen.findByRole('button', { name: 'Open Ship UI' }));
    for (const action of actions)
      expect(screen.getByRole('button', { name: action })).toBeDefined();
    expect(screen.getByRole('button', { name: 'Archive' })).toBeDefined();
  });
});
