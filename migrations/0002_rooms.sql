CREATE TABLE IF NOT EXISTS rooms (
  room_id    TEXT PRIMARY KEY,
  room_title TEXT DEFAULT '',
  joined_at  DATETIME DEFAULT (datetime('now')),
  bot_name   TEXT DEFAULT ''
);
