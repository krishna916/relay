import type { TaskDto, TaskView } from '../api/task-contracts.js';
import { TaskRow } from './TaskRow.js';
const empty: Record<TaskView, string> = {
  inbox: 'No tasks waiting for triage.',
  active: 'No active work.',
  backlog: 'Backlog is empty.',
  completed: 'No completed tasks yet.',
};
export function TaskList({
  view,
  tasks,
  selectedTaskId,
  onSelect,
}: {
  view: TaskView;
  tasks: readonly TaskDto[];
  selectedTaskId: string | null;
  onSelect: (task: TaskDto) => void;
}) {
  if (!tasks.length) return <p>{empty[view]}</p>;
  return (
    <ul className="task-list">
      {tasks.map((task) => (
        <TaskRow
          key={task.id}
          onSelect={onSelect}
          selected={task.id === selectedTaskId}
          task={task}
        />
      ))}
    </ul>
  );
}
