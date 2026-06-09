ALTER TABLE messages ADD COLUMN source_status TEXT DEFAULT 'legacy';
ALTER TABLE messages ADD COLUMN export_message_id TEXT DEFAULT '';
ALTER TABLE messages ADD COLUMN source_path TEXT DEFAULT '';
ALTER TABLE messages ADD COLUMN media_group_key TEXT DEFAULT '';

ALTER TABLE files ADD COLUMN export_message_id TEXT DEFAULT '';

CREATE TABLE IF NOT EXISTS export_ingest_runs (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  source_path TEXT,
  original_room TEXT,
  scanned_messages INTEGER DEFAULT 0,
  imported_messages INTEGER DEFAULT 0,
  skipped_messages INTEGER DEFAULT 0,
  failed_messages INTEGER DEFAULT 0,
  imported_files INTEGER DEFAULT 0,
  skipped_files INTEGER DEFAULT 0,
  failed_files INTEGER DEFAULT 0,
  active_messages INTEGER DEFAULT 0,
  active_files INTEGER DEFAULT 0,
  created_at TEXT DEFAULT CURRENT_TIMESTAMP
);
