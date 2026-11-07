-- January 2027 Read-a-thon
-- A household is one sign-up (one grown-up email) with one or more readers.
-- Paper-only households entered at the desk may have no email.
CREATE TABLE IF NOT EXISTS readathon_households (
  household_id INTEGER PRIMARY KEY AUTOINCREMENT,
  email TEXT UNIQUE COLLATE NOCASE,
  wants_updates INTEGER NOT NULL DEFAULT 0,
  source TEXT NOT NULL DEFAULT 'web',
  created_ms INTEGER NOT NULL
) STRICT;

CREATE TABLE IF NOT EXISTS readathon_readers (
  reader_id INTEGER PRIMARY KEY AUTOINCREMENT,
  household_id INTEGER NOT NULL REFERENCES readathon_households(household_id),
  name TEXT NOT NULL,
  age_group TEXT NOT NULL CHECK (age_group IN ('kid', 'teen', 'adult')),
  goal_minutes INTEGER NOT NULL DEFAULT 15,
  color INTEGER NOT NULL DEFAULT 0,
  created_ms INTEGER NOT NULL
) STRICT;
CREATE INDEX IF NOT EXISTS readathon_readers_household ON readathon_readers(household_id);

-- One row per reading session. day is the local date, YYYY-MM-DD.
CREATE TABLE IF NOT EXISTS readathon_entries (
  entry_id INTEGER PRIMARY KEY AUTOINCREMENT,
  reader_id INTEGER NOT NULL REFERENCES readathon_readers(reader_id),
  day TEXT NOT NULL,
  minutes INTEGER NOT NULL CHECK (minutes BETWEEN 1 AND 600),
  format TEXT,
  title TEXT,
  source TEXT NOT NULL DEFAULT 'manual' CHECK (source IN ('timer', 'manual', 'desk')),
  created_ms INTEGER NOT NULL
) STRICT;
CREATE INDEX IF NOT EXISTS readathon_entries_reader ON readathon_entries(reader_id, day);

-- Squares a reader has marked by hand or with an event code.
-- Automatic squares are worked out from the log and are not stored.
CREATE TABLE IF NOT EXISTS readathon_bingo (
  reader_id INTEGER NOT NULL REFERENCES readathon_readers(reader_id),
  square INTEGER NOT NULL CHECK (square BETWEEN 0 AND 24),
  source TEXT NOT NULL DEFAULT 'self',
  created_ms INTEGER NOT NULL,
  PRIMARY KEY (reader_id, square)
) STRICT;

-- Book recommendations wait for a volunteer before anyone else sees them.
CREATE TABLE IF NOT EXISTS readathon_recommendations (
  recommendation_id INTEGER PRIMARY KEY AUTOINCREMENT,
  household_id INTEGER REFERENCES readathon_households(household_id),
  title TEXT NOT NULL,
  author TEXT,
  list TEXT NOT NULL DEFAULT 'community',
  audience TEXT,
  why TEXT,
  recommended_by TEXT,
  read_during INTEGER NOT NULL DEFAULT 0,
  status TEXT NOT NULL DEFAULT 'pending' CHECK (status IN ('pending', 'approved', 'declined')),
  created_ms INTEGER NOT NULL,
  reviewed_ms INTEGER
) STRICT;
CREATE INDEX IF NOT EXISTS readathon_recommendations_status ON readathon_recommendations(status);
