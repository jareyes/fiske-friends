-- Registration details: where each household lives and each reader's birth year.
-- Required on the web sign-up; optional for paper sign-ups entered at the desk, so the columns allow NULL.
ALTER TABLE readathon_households ADD COLUMN city TEXT;
ALTER TABLE readathon_households ADD COLUMN state TEXT;
ALTER TABLE readathon_readers ADD COLUMN birth_year INTEGER CHECK (birth_year BETWEEN 1900 AND 2100);
