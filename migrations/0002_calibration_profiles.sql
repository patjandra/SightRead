-- Calibration profiles synced to an account. The composite primary key means
-- two users can never collide on an id, and every query is scoped by user_id.
--
-- Deletes are soft (deleted_at) so other devices learn about them on their next
-- sync; a tombstoned id is never resurrected.
CREATE TABLE calibration_profiles (
  user_id             TEXT NOT NULL REFERENCES users(id),
  id                  TEXT NOT NULL,
  name                TEXT NOT NULL,
  -- NULL points = created but not calibrated yet.
  point_top           REAL,
  point_center        REAL,
  point_bottom        REAL,
  calibration_version INTEGER,
  created_at          TEXT NOT NULL,
  -- ISO-8601 UTC strings (toISOString), so they compare correctly as text.
  updated_at          TEXT NOT NULL,
  deleted_at          TEXT,
  PRIMARY KEY (user_id, id)
);
