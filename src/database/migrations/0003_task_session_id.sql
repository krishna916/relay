ALTER TABLE tasks ADD COLUMN session_id TEXT NULL CHECK (
  session_id IS NULL
  OR (
    length(session_id) BETWEEN 1 AND 128
    AND session_id NOT GLOB '*[^A-Za-z0-9._:-]*'
  )
);

CREATE INDEX idx_tasks_created_by_session_created_at
ON tasks(created_by_type, session_id, created_at ASC, id ASC);
