import type { TaskView } from '../api/task-contracts.js';

const names: Record<TaskView, string> = {
  inbox: 'Inbox',
  active: 'Active',
  backlog: 'Backlog',
  completed: 'Completed',
};

export function ViewNavigation({
  view,
  onChange,
}: {
  view: TaskView;
  onChange: (view: TaskView) => void;
}) {
  return (
    <nav aria-label="Task views">
      {(Object.keys(names) as TaskView[]).map((item) => (
        <button
          aria-current={view === item ? 'page' : undefined}
          key={item}
          onClick={() => onChange(item)}
          type="button"
        >
          {names[item]}
        </button>
      ))}
    </nav>
  );
}
