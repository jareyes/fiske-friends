-- "What I'm reading": each reader's books, current and finished. The timer and the add-reading form
-- pick from it, and the reading log shows the time spent on each.
--   title_key: the title in lowercase (A-Z only, like SQLite's lower()), which is how log entries
--     (readathon_entries.title) are matched to a book
--   finished_day: the day they marked it finished, or NULL while they're still reading it
CREATE TABLE IF NOT EXISTS readathon_shelf (
  shelf_id INTEGER PRIMARY KEY AUTOINCREMENT,
  reader_id INTEGER NOT NULL REFERENCES readathon_readers(reader_id),
  title TEXT NOT NULL,
  title_key TEXT NOT NULL,
  author TEXT,
  format TEXT,
  finished_day TEXT,
  created_ms INTEGER NOT NULL,
  UNIQUE (reader_id, title_key)
) STRICT;

-- Titles already in reading logs become books on their readers' shelves
INSERT OR IGNORE INTO readathon_shelf (reader_id, title, title_key, format, created_ms)
SELECT reader_id, title, lower(title), format, MIN(created_ms)
  FROM readathon_entries
 WHERE title IS NOT NULL AND trim(title) != ''
 GROUP BY reader_id, lower(title);
