-- PDFs a signed-in user chose to keep in their account. The bytes live in R2
-- under a server-built key (`<user_id>/<random uuid>`); this table holds the
-- metadata. Composite key + user_id scoping on every query keep users apart.
CREATE TABLE pdfs (
  user_id    TEXT NOT NULL REFERENCES users(id),
  id         TEXT NOT NULL,
  name       TEXT NOT NULL,
  size       INTEGER NOT NULL,
  r2_key     TEXT NOT NULL,
  created_at TEXT NOT NULL,
  PRIMARY KEY (user_id, id)
);
