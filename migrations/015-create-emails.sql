-- Every email the site sends (or would send), for the admin's list at /plan/emails.
-- status: 'outbox' when SMTP isn't set up (the email is kept here instead of sent, with its body so
-- admins can read it), then 'sending', 'sent' or 'failed'. Bodies of real sends aren't kept: sign-in
-- emails hold a working sign-in link.
CREATE TABLE emails (
    email_id INTEGER PRIMARY KEY,
    kind TEXT NOT NULL,
    to_address TEXT NOT NULL,
    subject TEXT NOT NULL,
    status TEXT NOT NULL CHECK (status IN ('outbox', 'sending', 'sent', 'failed')),
    error TEXT,
    html TEXT,
    text TEXT,
    household_id INTEGER,
    is_test INTEGER NOT NULL DEFAULT 0,
    created_ms INTEGER NOT NULL,
    sent_ms INTEGER
);
CREATE INDEX emails_created ON emails (created_ms);
