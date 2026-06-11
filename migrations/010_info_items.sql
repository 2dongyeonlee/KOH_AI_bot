CREATE TABLE IF NOT EXISTS info_items (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  source_message_id TEXT,
  message_key TEXT,
  room_id TEXT,
  room_title TEXT,
  category TEXT,
  person_tag TEXT,
  reporter TEXT,
  title TEXT,
  summary TEXT,
  implication TEXT,
  source_text TEXT,
  sender_id TEXT,
  sender_name TEXT,
  message_time TEXT,
  raw_text TEXT,
  created_at DATETIME DEFAULT CURRENT_TIMESTAMP
);

CREATE INDEX IF NOT EXISTS idx_info_items_category_time
ON info_items(category, message_time);

CREATE INDEX IF NOT EXISTS idx_info_items_created_at
ON info_items(created_at);
