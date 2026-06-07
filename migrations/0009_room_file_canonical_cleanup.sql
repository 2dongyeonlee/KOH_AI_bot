-- Canonical room/source cleanup and test-room removal.
-- D1 SQLite: do not use ALTER TABLE ADD COLUMN IF NOT EXISTS here.

UPDATE messages
SET room_title = '1:1',
    source_type = 'telegram_private'
WHERE CAST(room_id AS INTEGER) > 0;

UPDATE messages
SET source_type = 'telegram_group'
WHERE CAST(room_id AS INTEGER) < 0;

UPDATE messages
SET room_title = '1:1',
    source_type = 'telegram_private'
WHERE room_id = '5965410906'
  AND (room_title = 'private_dm' OR source_type = 'telegram_group');

UPDATE rooms
SET room_title = '1:1',
    room_type = 'private'
WHERE CAST(room_id AS INTEGER) > 0;

UPDATE rooms
SET room_type = 'group'
WHERE CAST(room_id AS INTEGER) < 0;

UPDATE files
SET room_title = '1:1'
WHERE CAST(room_id AS INTEGER) > 0;

UPDATE files
SET room_title = (
  SELECT rooms.room_title
  FROM rooms
  WHERE rooms.room_id = files.room_id
  LIMIT 1
)
WHERE CAST(room_id AS INTEGER) < 0
  AND room_id IN (SELECT room_id FROM rooms);

DELETE FROM messages
WHERE room_id IN ('-5265055977', '-5156923133');

DELETE FROM files
WHERE room_id IN ('-5265055977', '-5156923133');

DELETE FROM room_members
WHERE room_id IN ('-5265055977', '-5156923133');

DELETE FROM rooms
WHERE room_id IN ('-5265055977', '-5156923133');
