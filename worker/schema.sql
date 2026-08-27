CREATE TABLE IF NOT EXISTS worlds (
  code       TEXT PRIMARY KEY,
  data       TEXT NOT NULL,
  version    INTEGER NOT NULL,
  updated_at INTEGER NOT NULL
);
