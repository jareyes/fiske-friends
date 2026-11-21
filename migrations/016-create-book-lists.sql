-- Each reader's reading list (books they starred) and the books they recommend, from the book lists page.
-- book_key names a book by its title and author's last name (lib/readathon-books.js), so a staff pick and
-- a reader's recommendation of the same book count as one.
CREATE TABLE IF NOT EXISTS readathon_book_saves (
  reader_id INTEGER NOT NULL REFERENCES readathon_readers(reader_id),
  book_key TEXT NOT NULL,
  created_ms INTEGER NOT NULL,
  PRIMARY KEY (reader_id, book_key)
) STRICT;
CREATE TABLE IF NOT EXISTS readathon_book_votes (
  reader_id INTEGER NOT NULL REFERENCES readathon_readers(reader_id),
  book_key TEXT NOT NULL,
  created_ms INTEGER NOT NULL,
  PRIMARY KEY (reader_id, book_key)
) STRICT;
CREATE INDEX IF NOT EXISTS readathon_book_votes_key ON readathon_book_votes(book_key);
