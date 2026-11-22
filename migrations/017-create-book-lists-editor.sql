-- The book lists, edited at the volunteer desk (/readathon/desk/books) instead of in code.
--   readathon_book_lists: the lists (Library picks, Cozy winter, ...), in the order shown
--   readathon_books: books picked by staff or volunteers, and reader picks a volunteer has edited
--   readathon_book_list_links: which lists each book is on
-- Approved reader recommendations still come from readathon_recommendations until someone edits one.
-- The sample books are not here: they're in seeds/ (the demo and dry run load them).
CREATE TABLE IF NOT EXISTS readathon_book_lists (
  list_id TEXT PRIMARY KEY,
  name TEXT NOT NULL,
  blurb TEXT NOT NULL DEFAULT '',
  sort INTEGER NOT NULL DEFAULT 0,
  is_hidden INTEGER NOT NULL DEFAULT 0,
  created_ms INTEGER NOT NULL
) STRICT;

CREATE TABLE IF NOT EXISTS readathon_books (
  book_id INTEGER PRIMARY KEY AUTOINCREMENT,
  title TEXT NOT NULL,
  author TEXT,
  why TEXT,
  recommended_by TEXT,
  audience TEXT,
  read_during INTEGER NOT NULL DEFAULT 0,
  is_hidden INTEGER NOT NULL DEFAULT 0,
  -- Set when this started as a reader's recommendation
  recommendation_id INTEGER REFERENCES readathon_recommendations(recommendation_id),
  created_ms INTEGER NOT NULL,
  updated_ms INTEGER NOT NULL
) STRICT;

CREATE TABLE IF NOT EXISTS readathon_book_list_links (
  book_id INTEGER NOT NULL REFERENCES readathon_books(book_id),
  list_id TEXT NOT NULL REFERENCES readathon_book_lists(list_id),
  PRIMARY KEY (book_id, list_id)
) STRICT;
CREATE INDEX IF NOT EXISTS readathon_book_list_links_list ON readathon_book_list_links(list_id);

-- The lists people browse by (moved here from lib/readathon-content.js). Volunteers can rename, reorder,
-- hide or add lists at the desk. "community" is where reader recommendations go.
INSERT OR IGNORE INTO readathon_book_lists (list_id, name, blurb, sort, created_ms) VALUES
  ('library', 'Library picks', 'Chosen by Fiske Free Library staff.', 1, 1795300000000),
  ('kids', 'Kids'' picks', 'Picked by kids, for kids.', 2, 1795300000000),
  ('easy', 'Easy reads', 'Short and welcoming. Most take an evening or two.', 3, 1795300000000),
  ('classics', 'Classics', 'Loved for generations. Many are free as e-books.', 4, 1795300000000),
  ('local', 'New England authors', 'Writers from New Hampshire and nearby.', 5, 1795300000000),
  ('cozy', 'Cozy winter', 'Snow, warmth, and comfort.', 6, 1795300000000),
  ('teens', 'Teens', 'For readers 12 and up.', 7, 1795300000000),
  ('community', 'Community picks', 'Recommended by read-a-thon readers.', 8, 1795300000000);
