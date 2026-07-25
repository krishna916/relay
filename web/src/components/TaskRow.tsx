import type { TaskDto } from '../api/task-contracts.js';
import { TaskStatusBadge } from './TaskStatusBadge.js';

export function TaskRow({
  task,
  selected,
  onSelect,
}: {
  task: TaskDto;
  selected: boolean;
  onSelect: (task: TaskDto) => void;
}) {
  return (
    <li>
      <button
        aria-label={`Open ${task.title}`}
        aria-pressed={selected}
        className="task-row"
        onClick={() => onSelect(task)}
        type="button"
      >
        <strong>{task.title}</strong>
        <TaskStatusBadge status={task.status} />
        {task.priority && <span>{task.priority}</span>}
        {task.workspace && <span>{task.workspace}</span>}
        <time dateTime={task.updatedAt}>{new Date(task.updatedAt).toLocaleString()}</time>
      </button>
    </li>
  );
}
