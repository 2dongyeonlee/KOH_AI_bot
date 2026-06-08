-- Safe migration: ensure canonical_name exists in users, backfill from name
-- Run: npx wrangler d1 execute 6r-ai-db --file=migrations/0011_user_canonical_name.sql --remote

ALTER TABLE users ADD COLUMN IF NOT EXISTS canonical_name TEXT DEFAULT '';

UPDATE users
SET canonical_name = COALESCE(NULLIF(canonical_name, ''), NULLIF(name, ''))
WHERE canonical_name IS NULL OR canonical_name = '';

-- Backfill uploader_name in files from users.canonical_name where blank/wrong
UPDATE files
SET uploader_name = (
  SELECT COALESCE(NULLIF(u.canonical_name, ''), NULLIF(u.name, ''))
  FROM users u
  WHERE CAST(u.telegram_id AS TEXT) = CAST(files.uploader_id AS TEXT)
    AND COALESCE(NULLIF(u.canonical_name, ''), NULLIF(u.name, '')) IS NOT NULL
  LIMIT 1
)
WHERE uploader_id IS NOT NULL
  AND uploader_id != ''
  AND (uploader_name IS NULL OR uploader_name = '' OR uploader_name IN ('계획', '담당', '미상', '이름 없음', '공유자 확인 필요'));
