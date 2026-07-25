import { useCallback, useEffect, useState } from 'react';
import { fetchHealth } from './api/health-client.js';
import {
  activateTask,
  archiveTask,
  completeTask,
  createTask,
  editTask,
  moveTaskToBacklog,
  moveTaskToInbox,
  RelayApiError,
  startTask,
} from './api/task-client.js';
import type { CreateTaskInput, EditTaskInput, TaskDto, TaskView } from './api/task-contracts.js';
import { ErrorBanner } from './components/ErrorBanner.js';
import { TaskComposer } from './components/TaskComposer.js';
import { TaskDetailsPanel } from './components/TaskDetailsPanel.js';
import { TaskList } from './components/TaskList.js';
import { ViewNavigation } from './components/ViewNavigation.js';
import { useTaskView } from './hooks/useTaskView.js';

const names: Record<TaskView, string> = {
  inbox: 'Inbox',
  active: 'Active',
  backlog: 'Backlog',
  completed: 'Completed',
};
function stays(view: TaskView, status: TaskDto['status']) {
  return (
    (view === 'inbox' && status === 'INBOX') ||
    (view === 'active' && (status === 'ACTIVE' || status === 'IN_PROGRESS')) ||
    (view === 'backlog' && status === 'BACKLOG') ||
    (view === 'completed' && status === 'DONE')
  );
}

export function App() {
  const [view, setView] = useState<TaskView>('active');
  const { tasks, loading, error, reload, replaceTask, removeTask } = useTaskView(view);
  const [selected, setSelected] = useState<TaskDto | null>(null);
  const [pending, setPending] = useState(false);
  const [message, setMessage] = useState<string | null>(null);
  const [serviceError, setServiceError] = useState(false);
  const [health, setHealth] = useState<string | null>(null);
  const [dirty, setDirty] = useState(false);
  const [deferred, setDeferred] = useState<(() => void) | null>(null);
  const checkHealth = useCallback(() => {
    setServiceError(false);
    void fetchHealth()
      .then((value) => setHealth(value.version))
      .catch(() => setServiceError(true));
  }, []);
  useEffect(() => {
    checkHealth();
  }, [checkHealth]);
  const requestChange = (change: () => void) => {
    if (dirty) setDeferred(() => change);
    else change();
  };
  const select = (task: TaskDto) =>
    requestChange(() => {
      setSelected(task);
      setMessage(null);
    });
  const changeView = (next: TaskView) =>
    requestChange(() => {
      setView(next);
      setSelected(null);
      setMessage(null);
    });
  const reconcile = (task: TaskDto) => {
    if (stays(view, task.status)) {
      replaceTask(task);
      setSelected(task);
    } else {
      removeTask(task.id);
      setSelected(null);
    }
  };
  async function capture(input: CreateTaskInput) {
    const created = await createTask(input);
    if (view !== 'inbox') setView('inbox');
    reload();
    setSelected(created);
  }
  async function save(id: string, input: EditTaskInput): Promise<boolean> {
    if (pending) return false;
    setPending(true);
    setMessage(null);
    try {
      reconcile(await editTask(id, input));
      return true;
    } catch (cause) {
      setMessage(cause instanceof Error ? cause.message : 'Unable to update task.');
      return false;
    } finally {
      setPending(false);
    }
  }
  async function action(name: 'inbox' | 'activate' | 'start' | 'backlog' | 'complete' | 'archive') {
    if (!selected || pending) return;
    const operation = {
      inbox: moveTaskToInbox,
      activate: activateTask,
      start: startTask,
      backlog: moveTaskToBacklog,
      complete: completeTask,
      archive: archiveTask,
    }[name];
    setPending(true);
    setMessage(null);
    try {
      reconcile(await operation(selected.id));
    } catch (cause) {
      setMessage(cause instanceof Error ? cause.message : 'Unable to update task.');
      if (cause instanceof RelayApiError && cause.status === 409) reload();
    } finally {
      setPending(false);
    }
  }
  return (
    <div className="app">
      <header>
        <div>
          <h1>Relay</h1>
          <p>Local task sidecar for human–AI workflows.</p>
        </div>
        <div aria-live="polite">
          {serviceError ? (
            <>
              <strong>Relay service unavailable</strong>{' '}
              <button onClick={checkHealth} type="button">
                Retry
              </button>
            </>
          ) : health ? (
            `Connected (v${health})`
          ) : (
            'Checking local service…'
          )}
        </div>
      </header>
      <ViewNavigation onChange={changeView} view={view} />
      {deferred && (
        <section aria-label="Discard changes confirmation">
          <p>Discard unsaved changes?</p>
          <button
            onClick={() => {
              const change = deferred;
              setDeferred(null);
              setDirty(false);
              change();
            }}
            type="button"
          >
            Discard changes
          </button>
          <button onClick={() => setDeferred(null)} type="button">
            Keep editing
          </button>
        </section>
      )}
      <main>
        <section className="work">
          <TaskComposer onCreate={capture} />
          <h2>{names[view]}</h2>
          {loading && !tasks.length && <p>Loading tasks…</p>}
          {error && <ErrorBanner message={error} onRetry={reload} />}
          <TaskList
            onSelect={select}
            selectedTaskId={selected?.id ?? null}
            tasks={tasks}
            view={view}
          />
        </section>
        <TaskDetailsPanel
          error={message}
          onAction={(name) => void action(name)}
          onDirtyChange={setDirty}
          onEdit={save}
          pending={pending}
          task={selected}
        />
      </main>
    </div>
  );
}
