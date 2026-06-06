CREATE TABLE IF NOT EXISTS external_sources (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  source_type TEXT,
  query TEXT,
  url TEXT,
  title TEXT,
  snippet TEXT,
  extracted_text TEXT,
  summary TEXT,
  provider TEXT,
  fetched_at TEXT DEFAULT CURRENT_TIMESTAMP
);

CREATE INDEX IF NOT EXISTS idx_external_sources_query
ON external_sources(query);

CREATE INDEX IF NOT EXISTS idx_external_sources_url
ON external_sources(url);
