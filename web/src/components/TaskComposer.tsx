import { useRef, useState } from 'react';
import type { CreateTaskInput } from '../api/task-contracts.js';
export function TaskComposer({
  onCreate,
}: {
  onCreate: (input: CreateTaskInput) => Promise<void>;
}) {
  const [title, setTitle] = useState('');
  const [description, setDescription] = useState('');
  const [workspace, setWorkspace] = useState('');
  const [priority, setPriority] = useState<CreateTaskInput['priority']>(null);
  const [pending, setPending] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const titleRef = useRef<HTMLInputElement>(null);
  async function submit(event: React.FormEvent) {
    event.preventDefault();
    if (pending) return;
    setPending(true);
    setError(null);
    try {
      await onCreate({
        title,
        description: description || null,
        workspace: workspace || null,
        priority,
      });
      setTitle('');
      setDescription('');
      setWorkspace('');
      setPriority(null);
      titleRef.current?.focus();
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : 'Unable to create task.');
    } finally {
      setPending(false);
    }
  }
  return (
    <form
      onSubmit={(event) => {
        void submit(event);
      }}
      className="composer"
    >
      <h2>Capture task</h2>
      <label>
        Title
        <input
          autoFocus
          aria-describedby={error ? 'create-task-error' : undefined}
          maxLength={300}
          required
          ref={titleRef}
          value={title}
          onChange={(event) => setTitle(event.target.value)}
        />
      </label>
      <details>
        <summary>Optional metadata</summary>
        <label>
          Description
          <textarea value={description} onChange={(event) => setDescription(event.target.value)} />
        </label>
        <label>
          Priority
          <select
            value={priority ?? ''}
            onChange={(event) =>
              setPriority(
                event.target.value === ''
                  ? null
                  : (event.target.value as CreateTaskInput['priority']),
              )
            }
          >
            <option value="">None</option>
            <option value="LOW">Low</option>
            <option value="NORMAL">Normal</option>
            <option value="HIGH">High</option>
          </select>
        </label>
        <label>
          Workspace
          <input value={workspace} onChange={(event) => setWorkspace(event.target.value)} />
        </label>
      </details>
      {error && (
        <p id="create-task-error" role="status">
          {error}
        </p>
      )}
      <button disabled={pending} type="submit">
        Create task
      </button>
    </form>
  );
}
