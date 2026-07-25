CREATE TABLE tasks (
  id TEXT PRIMARY KEY,
  title TEXT NOT NULL CHECK (length(trim(title)) BETWEEN 1 AND 300),
  description TEXT NULL CHECK (description IS NULL OR length(description) <= 10000),
  status TEXT NOT NULL CHECK (
    status IN ('INBOX', 'ACTIVE', 'IN_PROGRESS', 'BACKLOG', 'DONE', 'ARCHIVED')
  ),
  priority TEXT NULL CHECK (priority IS NULL OR priority IN ('LOW', 'NORMAL', 'HIGH')),
  workspace TEXT NULL CHECK (workspace IS NULL OR length(workspace) <= 255),
  source_context TEXT NULL CHECK (source_context IS NULL OR length(source_context) <= 1000),
  created_by_type TEXT NOT NULL CHECK (created_by_type IN ('HUMAN', 'AGENT')),
  created_by_name TEXT NULL CHECK (
    (created_by_name IS NULL OR length(created_by_name) <= 100)
    AND (
      created_by_type <> 'AGENT'
      OR (created_by_name IS NOT NULL AND length(trim(created_by_name)) > 0)
    )
  ),
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL,
  started_at TEXT NULL,
  completed_at TEXT NULL CHECK (
    (status = 'DONE' AND completed_at IS NOT NULL)
    OR (status = 'ARCHIVED')
    OR (status NOT IN ('DONE', 'ARCHIVED') AND completed_at IS NULL)
  ),
  archived_at TEXT NULL CHECK (
    (status = 'ARCHIVED' AND archived_at IS NOT NULL)
    OR (status <> 'ARCHIVED' AND archived_at IS NULL)
  )
);

CREATE INDEX idx_tasks_status_updated_at
ON tasks(status, updated_at DESC, created_at DESC, id ASC);
