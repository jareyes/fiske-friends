-- Read-a-thon teams: friends, coworkers, classes and clubs reading toward a shared goal.
-- A reader can be on as many teams as they like. The team's code is in its invite link.
-- A team's goal isn't stored: it's always its members' January goals added up.
CREATE TABLE IF NOT EXISTS readathon_teams (
  team_id INTEGER PRIMARY KEY AUTOINCREMENT,
  name TEXT NOT NULL,
  code TEXT NOT NULL UNIQUE,
  is_open INTEGER NOT NULL DEFAULT 0,
  is_hidden INTEGER NOT NULL DEFAULT 0,
  created_by_reader_id INTEGER REFERENCES readathon_readers(reader_id),
  -- When the team first reached its goal
  reached_ms INTEGER,
  created_ms INTEGER NOT NULL
) STRICT;

-- Who's on which team. Leaving sets left_ms instead of deleting, so a raffle entry already earned
-- (entry_ms) is kept. Rejoining clears left_ms.
CREATE TABLE IF NOT EXISTS readathon_team_members (
  team_id INTEGER NOT NULL REFERENCES readathon_teams(team_id),
  reader_id INTEGER NOT NULL REFERENCES readathon_readers(reader_id),
  joined_ms INTEGER NOT NULL,
  left_ms INTEGER,
  -- When this member earned a raffle entry because the team reached its goal
  entry_ms INTEGER,
  PRIMARY KEY (team_id, reader_id)
) STRICT;
CREATE INDEX IF NOT EXISTS readathon_team_members_reader ON readathon_team_members(reader_id);
