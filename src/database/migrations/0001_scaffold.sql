CREATE TABLE IF NOT EXISTS relay_metadata (
  key TEXT PRIMARY KEY,
  value TEXT NOT NULL,
  updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
);

INSERT OR IGNORE INTO relay_metadata (key, value) VALUES ('schema_version', '1');
