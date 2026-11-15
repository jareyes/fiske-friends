-- Prizes picked up at the library desk: an enamel pin for any bingo, a tote bag for a full card.
-- Volunteers record pickups so nobody gets two.
CREATE TABLE IF NOT EXISTS readathon_prize_pickups (
  reader_id INTEGER NOT NULL REFERENCES readathon_readers(reader_id),
  prize TEXT NOT NULL CHECK (prize IN ('pin', 'tote')),
  created_ms INTEGER NOT NULL,
  PRIMARY KEY (reader_id, prize)
) STRICT;
