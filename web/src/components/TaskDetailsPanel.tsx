import { useEffect, useMemo, useState } from 'react';
import type { EditTaskInput, TaskDto } from '../api/task-contracts.js';
import { TaskStatusBadge } from './TaskStatusBadge.js';

type Action = 'inbox' | 'activate' | 'start' | 'backlog' | 'complete' | 'archive';
type Draft = Required<EditTaskInput>;

function draftFor(task: TaskDto): Draft {
  return {
    title: task.title,
    description: task.description,
    priority: task.priority,
    workspace: task.workspace,
    sourceContext: task.sourceContext,
  };
}

function format(value: string | null) {
  return value ? new Date(value).toLocaleString() : 'Not set';
}

export function TaskDetailsPanel({
  task,
  pending,
  error,
  onEdit,
  onAction,
  onDirtyChange,
}: {
  task: TaskDto | null;
  pending: boolean;
  error: string | null;
  onEdit: (id: string, input: EditTaskInput) => Promise<boolean>;
  onAction: (action: Action) => void;
  onDirtyChange: (dirty: boolean) => void;
}) {
  const [editing, setEditing] = useState(false);
  const [draft, setDraft] = useState<Draft | null>(null);
  const [confirmArchive, setConfirmArchive] = useState(false);
  const original = useMemo(() => (task ? draftFor(task) : null), [task]);
  const dirty = editing && JSON.stringify(draft) !== JSON.stringify(original);

  useEffect(() => onDirtyChange(dirty), [dirty, onDirtyChange]);
  useEffect(() => {
    setEditing(false);
    setDraft(null);
    setConfirmArchive(false);
  }, [task?.id]);

  if (!task) return null;
  const update = <K extends keyof Draft>(key: K, value: Draft[K]) =>
    setDraft((current) => (current ? { ...current, [key]: value } : current));
  const save = async () => {
    if (!draft) return;
    if (await onEdit(task.id, draft)) setEditing(false);
  };
  const actions: readonly [string, Action][] =
    task.status === 'INBOX'
      ? [
          ['Activate', 'activate'],
          ['Move to backlog', 'backlog'],
        ]
      : task.status === 'ACTIVE'
        ? [
            ['Move to inbox', 'inbox'],
            ['Start', 'start'],
            ['Move to backlog', 'backlog'],
            ['Complete', 'complete'],
          ]
        : task.status === 'IN_PROGRESS'
          ? [
              ['Return to active', 'activate'],
              ['Move to backlog', 'backlog'],
              ['Complete', 'complete'],
            ]
          : task.status === 'BACKLOG'
            ? [
                ['Move to inbox', 'inbox'],
                ['Activate', 'activate'],
              ]
            : [];

  return (
    <section aria-label="Task details" className="details">
      <h2>{task.title}</h2>
      {error && <p role="status">{error}</p>}
      {editing && draft ? (
        <form
          onSubmit={(event) => {
            event.preventDefault();
            void save();
          }}
        >
          <label>
            Title
            <input
              maxLength={300}
              onChange={(event) => update('title', event.target.value)}
              required
              value={draft.title}
            />
          </label>
          <label>
            Description
            <textarea
              onChange={(event) => update('description', event.target.value || null)}
              value={draft.description ?? ''}
            />
          </label>
          <label>
            Priority
            <select
              onChange={(event) =>
                update(
                  'priority',
                  event.target.value === '' ? null : (event.target.value as TaskDto['priority']),
                )
              }
              value={draft.priority ?? ''}
            >
              <option value="">None</option>
              <option value="LOW">Low</option>
              <option value="NORMAL">Normal</option>
              <option value="HIGH">High</option>
            </select>
          </label>
          <label>
            Workspace
            <input
              onChange={(event) => update('workspace', event.target.value || null)}
              value={draft.workspace ?? ''}
            />
          </label>
          <label>
            Source context
            <textarea
              onChange={(event) => update('sourceContext', event.target.value || null)}
              value={draft.sourceContext ?? ''}
            />
          </label>
          <button disabled={pending} type="submit">
            Save changes
          </button>
          <button
            disabled={pending}
            onClick={() => {
              setDraft(original);
              setEditing(false);
            }}
            type="button"
          >
            Cancel
          </button>
        </form>
      ) : (
        <>
          <dl>
            <dt>Task ID</dt>
            <dd>{task.id}</dd>
            <dt>Status</dt>
            <dd>
              <TaskStatusBadge status={task.status} />
            </dd>
            <dt>Description</dt>
            <dd>{task.description ?? 'No description.'}</dd>
            <dt>Priority</dt>
            <dd>{task.priority ?? 'None'}</dd>
            <dt>Workspace</dt>
            <dd>{task.workspace ?? 'None'}</dd>
            <dt>Source context</dt>
            <dd>{task.sourceContext ?? 'None'}</dd>
            <dt>Created by</dt>
            <dd>
              {task.createdByType}
              {task.createdByName ? ` (${task.createdByName})` : ''}
            </dd>
            <dt>Created</dt>
            <dd>{format(task.createdAt)}</dd>
            <dt>Updated</dt>
            <dd>{format(task.updatedAt)}</dd>
            <dt>Started</dt>
            <dd>{format(task.startedAt)}</dd>
            <dt>Completed</dt>
            <dd>{format(task.completedAt)}</dd>
            <dt>Archived</dt>
            <dd>{format(task.archivedAt)}</dd>
          </dl>
          <button
            disabled={pending}
            onClick={() => {
              setDraft(original);
              setEditing(true);
            }}
            type="button"
          >
            Edit task
          </button>
          <div className="actions">
            {actions.map(([name, action]) => (
              <button
                disabled={pending}
                key={action}
                onClick={() => onAction(action)}
                type="button"
              >
                {name}
              </button>
            ))}
            {confirmArchive ? (
              <>
                <button disabled={pending} onClick={() => onAction('archive')} type="button">
                  Confirm archive
                </button>
                <button disabled={pending} onClick={() => setConfirmArchive(false)} type="button">
                  Cancel
                </button>
              </>
            ) : (
              <button disabled={pending} onClick={() => setConfirmArchive(true)} type="button">
                Archive
              </button>
            )}
          </div>
        </>
      )}
    </section>
  );
}
