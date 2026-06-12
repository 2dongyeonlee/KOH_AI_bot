ALTER TABLE messages ADD COLUMN type TEXT DEFAULT 'text';
ALTER TABLE messages ADD COLUMN status_tag TEXT DEFAULT '';
ALTER TABLE messages ADD COLUMN field_tag TEXT DEFAULT '';
ALTER TABLE messages ADD COLUMN milestone_date TEXT DEFAULT '';
ALTER TABLE messages ADD COLUMN file_id TEXT DEFAULT '';
ALTER TABLE messages ADD COLUMN file_name TEXT DEFAULT '';

CREATE INDEX IF NOT EXISTS idx_messages_slim_room_time
ON messages(room_id, created_at DESC);

CREATE INDEX IF NOT EXISTS idx_messages_slim_report
ON messages(type, status_tag, created_at DESC);

CREATE INDEX IF NOT EXISTS idx_messages_slim_file
ON messages(file_id);
