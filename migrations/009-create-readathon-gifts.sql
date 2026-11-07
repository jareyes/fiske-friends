-- Read-a-thon pledges and donations.
-- Each reader gets a hard-to-guess code for their "cheer me on" link.
ALTER TABLE readathon_readers ADD COLUMN cheer_code TEXT;
CREATE UNIQUE INDEX IF NOT EXISTS readathon_readers_cheer_code ON readathon_readers(cheer_code);

-- One row per successful payment. reader_id is empty for gifts to the whole read-a-thon.
CREATE TABLE IF NOT EXISTS readathon_gifts (
  gift_id INTEGER PRIMARY KEY AUTOINCREMENT,
  reader_id INTEGER REFERENCES readathon_readers(reader_id),
  amount_cents INTEGER NOT NULL CHECK (amount_cents > 0),
  display_name TEXT,
  message TEXT,
  hide_amount INTEGER NOT NULL DEFAULT 0,
  first_name TEXT NOT NULL,
  last_name TEXT NOT NULL,
  email TEXT NOT NULL,
  payment_intent_id TEXT NOT NULL UNIQUE,
  is_demo INTEGER NOT NULL DEFAULT 0,
  created_ms INTEGER NOT NULL
) STRICT;
CREATE INDEX IF NOT EXISTS readathon_gifts_reader ON readathon_gifts(reader_id);
