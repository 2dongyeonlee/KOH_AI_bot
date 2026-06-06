CREATE TABLE IF NOT EXISTS owner_candidates (
  telegram_id TEXT PRIMARY KEY,
  name TEXT,
  username TEXT,
  score INTEGER DEFAULT 0,
  evidence_json TEXT,
  status TEXT DEFAULT 'candidate',
  created_at TEXT DEFAULT CURRENT_TIMESTAMP,
  updated_at TEXT DEFAULT CURRENT_TIMESTAMP
);
