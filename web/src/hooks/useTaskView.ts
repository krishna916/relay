import { useCallback, useEffect, useRef, useState } from 'react';
import { listTasks } from '../api/task-client.js';
import type { TaskDto, TaskView } from '../api/task-contracts.js';

export function useTaskView(view: TaskView) {
  const [tasks, setTasks] = useState<readonly TaskDto[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const latest = useRef<AbortController | null>(null);
  const displayedView = useRef<TaskView>(view);
  const reload = useCallback(() => {
    latest.current?.abort();
    const controller = new AbortController();
    latest.current = controller;
    if (displayedView.current !== view) {
      displayedView.current = view;
      setTasks([]);
    }
    setLoading(true);
    setError(null);
    listTasks(view, view === 'completed' ? 50 : undefined, controller.signal)
      .then((items) => {
        if (latest.current !== controller) return;
        setTasks(items);
        setLoading(false);
        latest.current = null;
      })
      .catch((cause: unknown) => {
        if (
          latest.current !== controller ||
          (cause instanceof Error && cause.name === 'AbortError')
        )
          return;
        setError('Unable to load tasks.');
        setLoading(false);
        latest.current = null;
      });
  }, [view]);
  useEffect(() => {
    reload();
    return () => latest.current?.abort();
  }, [reload]);
  return {
    tasks,
    loading,
    error,
    reload,
    replaceTask: (task: TaskDto) =>
      setTasks((items) => items.map((item) => (item.id === task.id ? task : item))),
    removeTask: (id: string) => setTasks((items) => items.filter((item) => item.id !== id)),
  };
}
