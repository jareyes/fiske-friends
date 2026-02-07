CREATE TABLE IF NOT EXISTS members (
  member_id INTEGER PRIMARY KEY AUTOINCREMENT,
  email TEXT NOT NULL,
  first_name TEXT NOT NULL,
  last_name TEXT NOT NULL,
  address_line1 TEXT,
  address_line2 TEXT,
  city TEXT,
  state TEXT,
  zipcode TEXT,
  telephone TEXT,
  joined_ms INTEGER NOT NULL,
  updated_ms INTEGER NOT NULL
) STRICT;
