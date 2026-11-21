-- Sample events for the January 2027 read-a-thon: the draft schedule from lib/readathon-content.js.
-- NOT a migration, so running migrations never adds these to the live site. The demo and the dry run load
-- them. To put them on a real site on purpose: node bin/seed-readathon-events.js
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
