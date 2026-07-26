ALTER TABLE tasks ADD COLUMN normalized_title TEXT NOT NULL DEFAULT '';

UPDATE tasks SET normalized_title = relay_normalize_task_title_v1(title);

CREATE INDEX idx_tasks_normalized_title_active_workspace
ON tasks(normalized_title, workspace, updated_at DESC, id ASC)
WHERE status <> 'ARCHIVED';
