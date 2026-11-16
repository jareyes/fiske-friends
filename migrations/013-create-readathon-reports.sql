-- "Report a problem": notes from people testing or using the site, listed on the volunteer desk.
CREATE TABLE IF NOT EXISTS readathon_reports (
  report_id INTEGER PRIMARY KEY AUTOINCREMENT,
  household_id INTEGER REFERENCES readathon_households(household_id),
  page TEXT,
  message TEXT NOT NULL,
  contact TEXT,
  device TEXT,
  created_ms INTEGER NOT NULL,
  resolved_ms INTEGER
) STRICT;
CREATE INDEX IF NOT EXISTS readathon_reports_open ON readathon_reports(resolved_ms);
