CREATE TABLE IF NOT EXISTS users (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  telegram_id TEXT UNIQUE NOT NULL,
  chat_id TEXT,
  name TEXT,
  username TEXT,
  first_name TEXT,
  last_name TEXT,
  role TEXT,
  source TEXT DEFAULT 'auto',
  created_at TEXT DEFAULT CURRENT_TIMESTAMP,
  last_seen_at TEXT DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE IF NOT EXISTS rooms (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  room_id TEXT UNIQUE NOT NULL,
  room_title TEXT,
  room_type TEXT,
  bot_name TEXT DEFAULT 'koh',
  source TEXT DEFAULT 'auto',
  joined_at TEXT DEFAULT CURRENT_TIMESTAMP,
  created_at TEXT DEFAULT CURRENT_TIMESTAMP,
  last_seen_at TEXT DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE IF NOT EXISTS room_members (
  room_id TEXT NOT NULL,
  telegram_id TEXT NOT NULL,
  user_id TEXT,
  name TEXT,
  username TEXT,
  role TEXT,
  bot_name TEXT DEFAULT 'koh',
  first_seen_at TEXT DEFAULT CURRENT_TIMESTAMP,
  last_seen_at TEXT DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (room_id, telegram_id)
);

CREATE TABLE IF NOT EXISTS messages (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  telegram_message_id TEXT,
  room_id TEXT NOT NULL,
  room_title TEXT,
  sender_id TEXT,
  sender_name TEXT,
  content TEXT NOT NULL,
  source_type TEXT DEFAULT 'telegram_group',
  saved_by TEXT DEFAULT 'koh',
  importance INTEGER DEFAULT 0,
  created_at TEXT DEFAULT CURRENT_TIMESTAMP
);

CREATE INDEX IF NOT EXISTS idx_messages_room_time ON messages(room_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_messages_sender_time ON messages(sender_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_messages_content ON messages(content);

CREATE TABLE IF NOT EXISTS files (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  telegram_file_id TEXT,
  telegram_file_unique_id TEXT,
  r2_key TEXT,
  room_id TEXT,
  room_title TEXT,
  uploader_id TEXT,
  uploader_name TEXT,
  sender_id TEXT,
  sender_name TEXT,
  file_name TEXT,
  file_type TEXT,
  mime_type TEXT,
  content TEXT,
  extracted_text TEXT,
  summary TEXT,
  tags_json TEXT,
  saved_by TEXT DEFAULT 'koh',
  created_at TEXT DEFAULT CURRENT_TIMESTAMP
);

CREATE INDEX IF NOT EXISTS idx_files_time ON files(created_at DESC);
CREATE INDEX IF NOT EXISTS idx_files_name ON files(file_name);

CREATE TABLE IF NOT EXISTS meetings (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  title TEXT,
  meeting_date TEXT,
  source TEXT,
  raw_text TEXT,
  summary TEXT,
  decisions TEXT,
  action_items TEXT,
  attendees_json TEXT,
  created_by TEXT,
  created_at TEXT DEFAULT CURRENT_TIMESTAMP
);

CREATE INDEX IF NOT EXISTS idx_meetings_date ON meetings(meeting_date DESC);

CREATE TABLE IF NOT EXISTS briefs (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  user_id TEXT,
  brief_type TEXT,
  brief_date TEXT,
  content TEXT,
  sources_json TEXT,
  created_at TEXT DEFAULT CURRENT_TIMESTAMP
);

CREATE INDEX IF NOT EXISTS idx_briefs_user_date ON briefs(user_id, brief_date DESC);

CREATE TABLE IF NOT EXISTS learned_facts (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  fact_type TEXT NOT NULL,
  subject TEXT,
  content TEXT NOT NULL,
  confidence INTEGER DEFAULT 3,
  source_type TEXT,
  source_id TEXT,
  source_room TEXT,
  source_actor TEXT,
  source_time TEXT,
  created_at TEXT DEFAULT CURRENT_TIMESTAMP,
  updated_at TEXT DEFAULT CURRENT_TIMESTAMP
);

CREATE INDEX IF NOT EXISTS idx_learned_facts_subject ON learned_facts(subject);

CREATE TABLE IF NOT EXISTS memory_profile (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  profile_key TEXT UNIQUE NOT NULL,
  profile_value TEXT NOT NULL,
  evidence TEXT,
  confidence INTEGER DEFAULT 3,
  created_at TEXT DEFAULT CURRENT_TIMESTAMP,
  updated_at TEXT DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE IF NOT EXISTS keywords (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  keyword TEXT UNIQUE NOT NULL,
  description TEXT,
  is_active INTEGER DEFAULT 1,
  created_by TEXT,
  created_at TEXT DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE IF NOT EXISTS tasks (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  owner_id TEXT,
  title TEXT,
  description TEXT,
  source_type TEXT,
  source_id TEXT,
  status TEXT DEFAULT 'open',
  due_date TEXT,
  created_at TEXT DEFAULT CURRENT_TIMESTAMP,
  updated_at TEXT DEFAULT CURRENT_TIMESTAMP
);

ALTER TABLE rooms ADD COLUMN IF NOT EXISTS room_type TEXT;
ALTER TABLE rooms ADD COLUMN IF NOT EXISTS bot_name TEXT DEFAULT 'koh';
ALTER TABLE rooms ADD COLUMN IF NOT EXISTS source TEXT DEFAULT 'auto';
ALTER TABLE rooms ADD COLUMN IF NOT EXISTS joined_at TEXT;
ALTER TABLE rooms ADD COLUMN IF NOT EXISTS created_at TEXT;
ALTER TABLE rooms ADD COLUMN IF NOT EXISTS last_seen_at TEXT;

ALTER TABLE room_members ADD COLUMN IF NOT EXISTS telegram_id TEXT;
ALTER TABLE room_members ADD COLUMN IF NOT EXISTS user_id TEXT;
ALTER TABLE room_members ADD COLUMN IF NOT EXISTS name TEXT;
ALTER TABLE room_members ADD COLUMN IF NOT EXISTS username TEXT;
ALTER TABLE room_members ADD COLUMN IF NOT EXISTS role TEXT;
ALTER TABLE room_members ADD COLUMN IF NOT EXISTS bot_name TEXT DEFAULT 'koh';
ALTER TABLE room_members ADD COLUMN IF NOT EXISTS first_seen_at TEXT;
ALTER TABLE room_members ADD COLUMN IF NOT EXISTS last_seen_at TEXT;

ALTER TABLE messages ADD COLUMN IF NOT EXISTS telegram_message_id TEXT;
ALTER TABLE messages ADD COLUMN IF NOT EXISTS source_type TEXT DEFAULT 'telegram_group';
ALTER TABLE messages ADD COLUMN IF NOT EXISTS saved_by TEXT DEFAULT 'koh';
ALTER TABLE messages ADD COLUMN IF NOT EXISTS importance INTEGER DEFAULT 0;

ALTER TABLE files ADD COLUMN IF NOT EXISTS telegram_file_id TEXT;
ALTER TABLE files ADD COLUMN IF NOT EXISTS telegram_file_unique_id TEXT;
ALTER TABLE files ADD COLUMN IF NOT EXISTS r2_key TEXT;
ALTER TABLE files ADD COLUMN IF NOT EXISTS room_id TEXT;
ALTER TABLE files ADD COLUMN IF NOT EXISTS room_title TEXT;
ALTER TABLE files ADD COLUMN IF NOT EXISTS uploader_id TEXT;
ALTER TABLE files ADD COLUMN IF NOT EXISTS uploader_name TEXT;
ALTER TABLE files ADD COLUMN IF NOT EXISTS sender_id TEXT;
ALTER TABLE files ADD COLUMN IF NOT EXISTS sender_name TEXT;
ALTER TABLE files ADD COLUMN IF NOT EXISTS file_type TEXT;
ALTER TABLE files ADD COLUMN IF NOT EXISTS mime_type TEXT;
ALTER TABLE files ADD COLUMN IF NOT EXISTS content TEXT;
ALTER TABLE files ADD COLUMN IF NOT EXISTS extracted_text TEXT;
ALTER TABLE files ADD COLUMN IF NOT EXISTS tags_json TEXT;
ALTER TABLE files ADD COLUMN IF NOT EXISTS saved_by TEXT DEFAULT 'koh';
