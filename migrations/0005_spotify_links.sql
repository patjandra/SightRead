-- A user's Spotify login, kept only when they tick "Remember me". The refresh
-- token is AES-GCM encrypted (see worker/services/spotifyCrypto.js) and bound to
-- the user id, so it is useless if copied to another row. One link per user.
CREATE TABLE spotify_links (
  user_id           TEXT PRIMARY KEY REFERENCES users(id),
  refresh_token_enc TEXT NOT NULL,
  created_at        TEXT NOT NULL,
  updated_at        TEXT NOT NULL
);
