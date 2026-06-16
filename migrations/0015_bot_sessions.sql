CREATE TABLE IF NOT EXISTS bot_sessions (
  room_id       TEXT PRIMARY KEY,
  last_reply_at TEXT,
  last_msg_id   INTEGER
);
