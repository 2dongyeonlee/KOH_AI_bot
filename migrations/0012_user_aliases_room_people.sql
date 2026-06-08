CREATE TABLE IF NOT EXISTS user_aliases (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  telegram_id TEXT NOT NULL,
  alias_name TEXT NOT NULL,
  source TEXT,
  source_room_id TEXT,
  source_room_title TEXT,
  source_table TEXT,
  source_id TEXT,
  first_seen_at TEXT DEFAULT CURRENT_TIMESTAMP,
  last_seen_at TEXT DEFAULT CURRENT_TIMESTAMP,
  count INTEGER DEFAULT 1
);

CREATE UNIQUE INDEX IF NOT EXISTS idx_user_aliases_unique
ON user_aliases(telegram_id, alias_name);

CREATE TABLE IF NOT EXISTS room_people (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  room_id TEXT NOT NULL,
  room_title TEXT,
  telegram_id TEXT,
  person_name TEXT NOT NULL,
  canonical_name TEXT,
  username TEXT,
  team TEXT,
  role TEXT,
  source TEXT DEFAULT 'auto',
  confidence TEXT DEFAULT 'confirmed',
  owner_user_id TEXT,
  owner_name TEXT,
  first_seen_at TEXT DEFAULT CURRENT_TIMESTAMP,
  last_seen_at TEXT DEFAULT CURRENT_TIMESTAMP,
  updated_at TEXT DEFAULT CURRENT_TIMESTAMP
);

CREATE INDEX IF NOT EXISTS idx_room_people_room_telegram
ON room_people(room_id, telegram_id);

CREATE INDEX IF NOT EXISTS idx_room_people_room_name
ON room_people(room_id, person_name);
