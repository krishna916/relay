ALTER TABLE tasks ADD COLUMN normalized_title TEXT NOT NULL DEFAULT '';

WITH RECURSIVE normalized_titles(id, source, position, normalized, whitespace) AS (
  SELECT id, lower(trim(rtrim(trim(title), '.!?'))), 1, '', 0
  FROM tasks
  UNION ALL
  SELECT
    id,
    source,
    position + 1,
    CASE
      WHEN substr(source, position, 1) IN (' ', char(9), char(10), char(11), char(12), char(13))
        THEN normalized
      ELSE normalized || CASE WHEN whitespace = 1 AND length(normalized) > 0 THEN ' ' ELSE '' END || substr(source, position, 1)
    END,
    CASE WHEN substr(source, position, 1) IN (' ', char(9), char(10), char(11), char(12), char(13)) THEN 1 ELSE 0 END
  FROM normalized_titles
  WHERE position <= length(source)
)
UPDATE tasks
SET normalized_title = (
  SELECT normalized
  FROM normalized_titles
  WHERE normalized_titles.id = tasks.id
    AND position > length(source)
);

CREATE INDEX idx_tasks_normalized_title_active_workspace
ON tasks(normalized_title, workspace, updated_at DESC, id ASC)
WHERE status <> 'ARCHIVED';
