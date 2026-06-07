ALTER TABLE users ADD COLUMN canonical_name TEXT;
ALTER TABLE users ADD COLUMN name_candidates TEXT;

UPDATE users
SET canonical_name = COALESCE(NULLIF(canonical_name, ''), NULLIF(name, ''))
WHERE canonical_name IS NULL OR canonical_name = '';
