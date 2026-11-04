-- SHA-256 of each PDF's bytes (hex), so saving the same file twice finds the
-- copy already in the account instead of storing another. Unique per user only;
-- NULL for files saved before this column existed, which are never matched.
ALTER TABLE pdfs ADD COLUMN sha256 TEXT;
CREATE UNIQUE INDEX pdfs_user_sha256 ON pdfs (user_id, sha256) WHERE sha256 IS NOT NULL;
