-- Backfill file room/user display fields.
-- D1 SQLite may fail on duplicate ADD COLUMN, so column additions are documented in README.

CREATE INDEX IF NOT EXISTS idx_files_unique_room_user
ON files(telegram_file_unique_id, room_id, uploader_id);

UPDATE files
SET room_title = (
  SELECT rooms.room_title
  FROM rooms
  WHERE rooms.room_id = files.room_id
  LIMIT 1
)
WHERE room_id IN (SELECT room_id FROM rooms)
  AND (room_title IS NULL OR room_title = '' OR room_title = '1:1');

UPDATE files
SET uploader_name = (
  SELECT users.name
  FROM users
  WHERE users.telegram_id = files.uploader_id
    AND users.name IS NOT NULL
    AND users.name != ''
  LIMIT 1
)
WHERE uploader_id IN (SELECT telegram_id FROM users)
  AND (uploader_name IS NULL OR uploader_name = '' OR uploader_name IN ('계획', '담당', '미상', '이름 없음'));

UPDATE files
SET sender_name = (
  SELECT users.name
  FROM users
  WHERE users.telegram_id = files.sender_id
    AND users.name IS NOT NULL
    AND users.name != ''
  LIMIT 1
)
WHERE sender_id IN (SELECT telegram_id FROM users)
  AND (sender_name IS NULL OR sender_name = '' OR sender_name IN ('계획', '담당', '미상', '이름 없음'));

UPDATE files
SET uploader_id = sender_id
WHERE (uploader_id IS NULL OR uploader_id = '')
  AND sender_id IS NOT NULL
  AND sender_id != '';

UPDATE files
SET uploader_name = sender_name
WHERE (uploader_name IS NULL OR uploader_name = '')
  AND sender_name IS NOT NULL
  AND sender_name != '';
