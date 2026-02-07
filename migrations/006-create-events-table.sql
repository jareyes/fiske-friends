CREATE TABLE IF NOT EXISTS events (
  event_id INTEGER PRIMARY KEY AUTOINCREMENT,
  description TEXT,
  end_ms INTEGER NOT NULL,
  is_published INTEGER,
  location TEXT,
  title TEXT NOT NULL,
  slug TEXT NOT NULL,
  start_ms INTEGER NOT NULL,
  summary TEXT,
  created_ms INTEGER NOT NULL,
  updated_ms INTEGER NOT NULL
) STRICT;
