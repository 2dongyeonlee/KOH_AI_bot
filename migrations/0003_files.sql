CREATE TABLE IF NOT EXISTS files (
  id          INTEGER PRIMARY KEY AUTOINCREMENT,
  room_id     TEXT NOT NULL,
  room_title  TEXT DEFAULT '',
  sender_id   TEXT NOT NULL,
  sender_name TEXT DEFAULT '',
  file_name   TEXT DEFAULT '',
  mime_type   TEXT DEFAULT '',
  summary     TEXT DEFAULT '',
  saved_by    TEXT DEFAULT 'koh',
  created_at  DATETIME DEFAULT (datetime('now'))
);
CREATE INDEX IF NOT EXISTS idx_files_room ON files(room_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_files_created ON files(created_at DESC);
