import { Hono } from "hono";
import { ApiError } from "../errors.js";
import { requireAuth } from "../middleware/requireAuth.js";
import {
  MAX_REFRESH_TOKEN_CHARS,
  deleteLink,
  mintAccessToken,
  saveLink,
} from "../services/spotifyLink.js";

const spotify = new Hono();

spotify.use("*", requireAuth);
spotify.use("*", async (c, next) => {
  c.header("Cache-Control", "no-store");
  await next();
});

// Remember this user's Spotify login (encrypted at rest).
spotify.put("/link", async (c) => {
  const body = await c.req.json().catch(() => null);
  const token = body?.refreshToken;
  if (typeof token !== "string" || !token || token.length > MAX_REFRESH_TOKEN_CHARS) {
    throw new ApiError(400, "invalid_token", "A Spotify refresh token is required.");
  }
  await saveLink(c.env, c.get("userId"), token);
  return c.body(null, 204);
});

// A fresh Spotify access token for the remembered login. The refresh token
// itself never leaves the server.
spotify.get("/token", async (c) => {
  let minted;
  try {
    minted = await mintAccessToken(c.env, c.get("userId"));
  } catch (err) {
    console.error("[sightread] spotify token refresh failed:", err);
    throw new ApiError(502, "spotify_unavailable", "Couldn't reach Spotify.");
  }
  if (!minted) throw new ApiError(404, "not_linked", "No Spotify account is remembered.");
  return c.json(minted);
});

spotify.delete("/link", async (c) => {
  await deleteLink(c.env.DB, c.get("userId"));
  return c.body(null, 204);
});

export default spotify;
