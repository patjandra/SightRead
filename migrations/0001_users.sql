-- Accounts. `id` is the internal SightRead UUID; `google_sub` is Google's stable
-- subject identifier and is the only thing we trust to identify a person
-- (email addresses can change).
CREATE TABLE users (
  id            TEXT PRIMARY KEY,
  google_sub    TEXT NOT NULL UNIQUE,
  email         TEXT NOT NULL,
  name          TEXT,
  picture       TEXT,
  created_at    TEXT NOT NULL,
  last_login_at TEXT NOT NULL
);
