// All Spotify-link SQL and the token exchange live here; routes never touch D1.
import { decryptToken, encryptToken } from "./spotifyCrypto.js";

const TOKEN_URL = "https://accounts.spotify.com/api/token";
export const MAX_REFRESH_TOKEN_CHARS = 2048;

export async function saveLink(env, userId, refreshToken) {
  const enc = await encryptToken(env.SPOTIFY_TOKEN_KEY, userId, refreshToken);
  const now = new Date().toISOString();
  await env.DB.prepare(
    `INSERT INTO spotify_links (user_id, refresh_token_enc, created_at, updated_at)
     VALUES (?, ?, ?, ?)
     ON CONFLICT(user_id) DO UPDATE SET
       refresh_token_enc = excluded.refresh_token_enc,
       updated_at = excluded.updated_at`
  )
    .bind(userId, enc, now, now)
    .run();
}

export async function deleteLink(db, userId) {
  await db.prepare("DELETE FROM spotify_links WHERE user_id = ?").bind(userId).run();
}

/**
 * Trades the stored refresh token for a fresh access token. Returns null when
 * there is no usable link: none saved, it can't be decrypted, or the user
 * revoked access at Spotify (the dead link is removed). Throws on Spotify
 * being unreachable so the caller reports a retryable error instead.
 */
export async function mintAccessToken(env, userId) {
  const row = await env.DB.prepare("SELECT refresh_token_enc FROM spotify_links WHERE user_id = ?")
    .bind(userId)
    .first();
  if (!row) return null;

  const refreshToken = await decryptToken(env.SPOTIFY_TOKEN_KEY, userId, row.refresh_token_enc);
  if (!refreshToken) {
    await deleteLink(env.DB, userId);
    return null;
  }

  const res = await fetch(TOKEN_URL, {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({
      grant_type: "refresh_token",
      refresh_token: refreshToken,
      client_id: env.SPOTIFY_CLIENT_ID,
    }),
  });

  if (res.status === 400 || res.status === 401) {
    // invalid_grant: revoked or expired. Nothing to retry.
    await deleteLink(env.DB, userId);
    return null;
  }
  if (!res.ok) throw new Error(`Spotify token endpoint returned ${res.status}`);

  const json = await res.json();
  // Spotify may rotate the refresh token; keep the newest one.
  if (json.refresh_token && json.refresh_token !== refreshToken) {
    await saveLink(env, userId, json.refresh_token);
  }
  return { accessToken: json.access_token, expiresIn: json.expires_in };
}
