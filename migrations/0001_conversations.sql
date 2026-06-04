CREATE TABLE IF NOT EXISTS conversations (
  id          INTEGER PRIMARY KEY AUTOINCREMENT,
  user_id     TEXT NOT NULL,
  user_name   TEXT DEFAULT '',
  question    TEXT NOT NULL,
  answer      TEXT NOT NULL,
  context     TEXT DEFAULT '',
  quality     INTEGER DEFAULT 0,
  created_at  DATETIME DEFAULT (datetime('now'))
);
CREATE INDEX IF NOT EXISTS idx_conv_user ON conversations(user_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_conv_created ON conversations(created_at DESC);
