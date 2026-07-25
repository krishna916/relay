import type { TaskDto } from '../api/task-contracts.js';

export function TaskStatusBadge({ status }: { status: TaskDto['status'] }) {
  return <span className="status-badge">{status}</span>;
}
