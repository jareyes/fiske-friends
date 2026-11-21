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

-- The tags admins pick from. The read-a-thon's series tag is here because readathon.event_tag in the config
-- points at it. Its events aren't: sample ones are in seeds/, and real ones are made at /plan/events.
INSERT OR IGNORE INTO event_tags (slug, name, kind, sort, created_ms) VALUES
  ('kids', 'Kids', 'audience', 1, 1794700000000),
  ('teens', 'Teens', 'audience', 2, 1794700000000),
  ('grown-ups', 'Grown-ups', 'audience', 3, 1794700000000),
  ('all-ages', 'All ages', 'audience', 4, 1794700000000),
  ('readathon-2027-01', 'Read-a-thon: January 2027', 'series', 0, 1794700000000);
