-- Event tags: general labels for events on the main site's events table.
--   series:   a program or event series, like a read-a-thon or summer reading. An event can be in several.
--   audience: who it's for: kids, teens, grown-ups, all ages.
-- A read-a-thon's calendar shows the events tagged with its series (readathon.event_tag in the config).
CREATE TABLE IF NOT EXISTS event_tags (
  tag_id INTEGER PRIMARY KEY AUTOINCREMENT,
  slug TEXT NOT NULL UNIQUE,
  name TEXT NOT NULL,
  kind TEXT NOT NULL CHECK (kind IN ('series', 'audience')),
  sort INTEGER NOT NULL DEFAULT 0,
  created_ms INTEGER NOT NULL
) STRICT;

CREATE TABLE IF NOT EXISTS event_tag_links (
  event_id INTEGER NOT NULL REFERENCES events(event_id),
  tag_id INTEGER NOT NULL REFERENCES event_tags(tag_id),
  PRIMARY KEY (event_id, tag_id)
) STRICT;
CREATE INDEX IF NOT EXISTS event_tag_links_tag ON event_tag_links(tag_id);

-- The code people enter at an event to mark a read-a-thon bingo square. Never shown on the site.
ALTER TABLE events ADD COLUMN bingo_code TEXT;
-- Street address, for events away from the library. Empty means the library itself.
ALTER TABLE events ADD COLUMN address TEXT;

INSERT OR IGNORE INTO event_tags (slug, name, kind, sort, created_ms) VALUES
  ('kids', 'Kids', 'audience', 1, 1794700000000),
  ('teens', 'Teens', 'audience', 2, 1794700000000),
  ('grown-ups', 'Grown-ups', 'audience', 3, 1794700000000),
  ('all-ages', 'All ages', 'audience', 4, 1794700000000),
  ('readathon-2027-01', 'Read-a-thon: January 2027', 'series', 0, 1794700000000);

-- The January 2027 read-a-thon's events, moved here from lib/readathon-content.js
INSERT OR IGNORE INTO events (title, slug, start_ms, end_ms, location, summary, description, is_published, bingo_code, created_ms, updated_ms) VALUES
  ('Kickoff open house', '2027-01-02-kickoff-open-house', 1798902000000, 1798912800000, 'Whole library', 'Pick up your kit and get help signing up.', '', 1, NULL, 1794700000000, 1794700000000),
  ('Silent Book Club', '2027-01-07-silent-book-club', 1799364600000, 1799370000000, 'Reading Room', 'Read quietly together. Cocoa and low lamps.', '', 1, 'SILENT', 1794700000000, 1794700000000),
  ('Pajama story time', '2027-01-09-pajama-story-time', 1799508600000, 1799514000000, 'Children''s Room', 'Wear your pajamas. Hot cocoa after.', '', 1, NULL, 1794700000000, 1794700000000),
  ('Silent Book Club', '2027-01-14-silent-book-club', 1799969400000, 1799974800000, 'Reading Room', 'Read quietly together. Cocoa and low lamps.', '', 1, 'SILENT', 1794700000000, 1794700000000),
  ('Author talk', '2027-01-16-author-talk', 1800126000000, 1800131400000, 'Community Room', 'A New Hampshire author, to be announced.', '', 1, 'AUTHOR', 1794700000000, 1794700000000),
  ('MLK Day read-aloud', '2027-01-18-mlk-day-read-aloud', 1800286200000, 1800291600000, 'Children''s Room', 'No school today. Stories and card-making.', '', 1, NULL, 1794700000000, 1794700000000),
  ('Silent Book Club', '2027-01-21-silent-book-club', 1800574200000, 1800579600000, 'Reading Room', 'Read quietly together. Cocoa and low lamps.', '', 1, 'SILENT', 1794700000000, 1794700000000),
  ('Teen night: manga and pizza', '2027-01-22-teen-night-manga-and-pizza', 1800655200000, 1800660600000, 'Teen corner', 'Ages 12 to 18.', '', 1, NULL, 1794700000000, 1794700000000),
  ('Silent Book Club', '2027-01-28-silent-book-club', 1801179000000, 1801184400000, 'Reading Room', 'Read quietly together. Cocoa and low lamps.', '', 1, 'SILENT', 1794700000000, 1794700000000),
  ('Read-in marathon', '2027-01-30-read-in-marathon', 1801321200000, 1801350000000, 'Whole library', 'Drop in and read for any amount of time.', '', 1, 'MARATHON', 1794700000000, 1794700000000),
  ('Finale party', '2027-02-06-finale-party', 1801933200000, 1801938600000, 'Community Room', 'Pizza, prizes, and the big total.', '', 1, NULL, 1794700000000, 1794700000000);

INSERT OR IGNORE INTO event_tag_links (event_id, tag_id) VALUES
  ((SELECT event_id FROM events WHERE slug = '2027-01-02-kickoff-open-house'), (SELECT tag_id FROM event_tags WHERE slug = 'readathon-2027-01')),
  ((SELECT event_id FROM events WHERE slug = '2027-01-02-kickoff-open-house'), (SELECT tag_id FROM event_tags WHERE slug = 'all-ages')),
  ((SELECT event_id FROM events WHERE slug = '2027-01-07-silent-book-club'), (SELECT tag_id FROM event_tags WHERE slug = 'readathon-2027-01')),
  ((SELECT event_id FROM events WHERE slug = '2027-01-07-silent-book-club'), (SELECT tag_id FROM event_tags WHERE slug = 'teens')),
  ((SELECT event_id FROM events WHERE slug = '2027-01-07-silent-book-club'), (SELECT tag_id FROM event_tags WHERE slug = 'grown-ups')),
  ((SELECT event_id FROM events WHERE slug = '2027-01-09-pajama-story-time'), (SELECT tag_id FROM event_tags WHERE slug = 'readathon-2027-01')),
  ((SELECT event_id FROM events WHERE slug = '2027-01-09-pajama-story-time'), (SELECT tag_id FROM event_tags WHERE slug = 'kids')),
  ((SELECT event_id FROM events WHERE slug = '2027-01-14-silent-book-club'), (SELECT tag_id FROM event_tags WHERE slug = 'readathon-2027-01')),
  ((SELECT event_id FROM events WHERE slug = '2027-01-14-silent-book-club'), (SELECT tag_id FROM event_tags WHERE slug = 'teens')),
  ((SELECT event_id FROM events WHERE slug = '2027-01-14-silent-book-club'), (SELECT tag_id FROM event_tags WHERE slug = 'grown-ups')),
  ((SELECT event_id FROM events WHERE slug = '2027-01-16-author-talk'), (SELECT tag_id FROM event_tags WHERE slug = 'readathon-2027-01')),
  ((SELECT event_id FROM events WHERE slug = '2027-01-16-author-talk'), (SELECT tag_id FROM event_tags WHERE slug = 'all-ages')),
  ((SELECT event_id FROM events WHERE slug = '2027-01-18-mlk-day-read-aloud'), (SELECT tag_id FROM event_tags WHERE slug = 'readathon-2027-01')),
  ((SELECT event_id FROM events WHERE slug = '2027-01-18-mlk-day-read-aloud'), (SELECT tag_id FROM event_tags WHERE slug = 'kids')),
  ((SELECT event_id FROM events WHERE slug = '2027-01-21-silent-book-club'), (SELECT tag_id FROM event_tags WHERE slug = 'readathon-2027-01')),
  ((SELECT event_id FROM events WHERE slug = '2027-01-21-silent-book-club'), (SELECT tag_id FROM event_tags WHERE slug = 'teens')),
  ((SELECT event_id FROM events WHERE slug = '2027-01-21-silent-book-club'), (SELECT tag_id FROM event_tags WHERE slug = 'grown-ups')),
  ((SELECT event_id FROM events WHERE slug = '2027-01-22-teen-night-manga-and-pizza'), (SELECT tag_id FROM event_tags WHERE slug = 'readathon-2027-01')),
  ((SELECT event_id FROM events WHERE slug = '2027-01-22-teen-night-manga-and-pizza'), (SELECT tag_id FROM event_tags WHERE slug = 'teens')),
  ((SELECT event_id FROM events WHERE slug = '2027-01-28-silent-book-club'), (SELECT tag_id FROM event_tags WHERE slug = 'readathon-2027-01')),
  ((SELECT event_id FROM events WHERE slug = '2027-01-28-silent-book-club'), (SELECT tag_id FROM event_tags WHERE slug = 'teens')),
  ((SELECT event_id FROM events WHERE slug = '2027-01-28-silent-book-club'), (SELECT tag_id FROM event_tags WHERE slug = 'grown-ups')),
  ((SELECT event_id FROM events WHERE slug = '2027-01-30-read-in-marathon'), (SELECT tag_id FROM event_tags WHERE slug = 'readathon-2027-01')),
  ((SELECT event_id FROM events WHERE slug = '2027-01-30-read-in-marathon'), (SELECT tag_id FROM event_tags WHERE slug = 'all-ages')),
  ((SELECT event_id FROM events WHERE slug = '2027-02-06-finale-party'), (SELECT tag_id FROM event_tags WHERE slug = 'readathon-2027-01')),
  ((SELECT event_id FROM events WHERE slug = '2027-02-06-finale-party'), (SELECT tag_id FROM event_tags WHERE slug = 'all-ages'));
