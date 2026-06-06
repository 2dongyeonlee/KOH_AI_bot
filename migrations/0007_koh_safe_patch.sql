-- Safe patch: adds missing columns only (IF NOT EXISTS prevents errors on re-run)
-- Run: npx wrangler d1 execute 6r-ai-db --file=migrations/0007_koh_safe_patch.sql --remote

ALTER TABLE messages ADD COLUMN IF NOT EXISTS source_type TEXT DEFAULT 'telegram_group';
ALTER TABLE messages ADD COLUMN IF NOT EXISTS importance INTEGER DEFAULT 0;
ALTER TABLE messages ADD COLUMN IF NOT EXISTS telegram_message_id TEXT DEFAULT '';

ALTER TABLE rooms ADD COLUMN IF NOT EXISTS room_type TEXT DEFAULT 'group';
ALTER TABLE rooms ADD COLUMN IF NOT EXISTS source TEXT DEFAULT 'auto';
ALTER TABLE rooms ADD COLUMN IF NOT EXISTS last_seen_at DATETIME DEFAULT (datetime('now'));

ALTER TABLE room_members ADD COLUMN IF NOT EXISTS name TEXT DEFAULT '';
ALTER TABLE room_members ADD COLUMN IF NOT EXISTS username TEXT DEFAULT '';
ALTER TABLE room_members ADD COLUMN IF NOT EXISTS last_seen_at DATETIME DEFAULT (datetime('now'));

ALTER TABLE files ADD COLUMN IF NOT EXISTS telegram_file_id TEXT DEFAULT '';
ALTER TABLE files ADD COLUMN IF NOT EXISTS telegram_file_unique_id TEXT DEFAULT '';
ALTER TABLE files ADD COLUMN IF NOT EXISTS r2_key TEXT DEFAULT '';
ALTER TABLE files ADD COLUMN IF NOT EXISTS extracted_text TEXT DEFAULT '';
ALTER TABLE files ADD COLUMN IF NOT EXISTS tags_json TEXT DEFAULT '[]';

-- Backfill rooms from messages (uncomment and run separately if rooms table is empty but messages has data)
-- INSERT OR IGNORE INTO rooms (room_id, room_title, source)
-- SELECT DISTINCT room_id, room_title, 'backfilled_from_messages'
-- FROM messages
-- WHERE room_id IS NOT NULL AND room_id != '' AND room_id != 'undefined';
