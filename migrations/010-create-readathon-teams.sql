-- Read-a-thon teams: friends, coworkers, classes and clubs reading toward a shared goal.
-- A reader can be on one team at a time. The team's code is in its invite link.
CREATE TABLE IF NOT EXISTS readathon_teams (
  team_id INTEGER PRIMARY KEY AUTOINCREMENT,
  name TEXT NOT NULL,
  goal_minutes INTEGER NOT NULL CHECK (goal_minutes > 0),
  code TEXT NOT NULL UNIQUE,
  is_open INTEGER NOT NULL DEFAULT 0,
  is_hidden INTEGER NOT NULL DEFAULT 0,
  created_by_reader_id INTEGER REFERENCES readathon_readers(reader_id),
  created_ms INTEGER NOT NULL
) STRICT;

ALTER TABLE readathon_readers ADD COLUMN team_id INTEGER REFERENCES readathon_teams(team_id);
CREATE INDEX IF NOT EXISTS readathon_readers_team ON readathon_readers(team_id);
