-- Who sees what a reader is reading.
--   readathon_shelf.is_private: a book only its reader sees
--   readathon_readers.share_books_team: show their books on their profile to teammates
--     (NULL means the default: yes for teens and grown-ups, no for kids)
--   readathon_readers.share_books_cheer: show their books on their public cheer page (off at first)
ALTER TABLE readathon_shelf ADD COLUMN is_private INTEGER NOT NULL DEFAULT 0;
ALTER TABLE readathon_readers ADD COLUMN share_books_team INTEGER;
ALTER TABLE readathon_readers ADD COLUMN share_books_cheer INTEGER NOT NULL DEFAULT 0;
