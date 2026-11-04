import { Hono } from "hono";
import { ApiError } from "../errors.js";
import { verifyGoogleIdToken } from "../services/googleToken.js";
import { upsertGoogleUser, getUserById } from "../services/users.js";
import {
  readSessionCookie,
  verifySession,
  writeSessionCookie,
  clearSessionCookie,
  readNonceCookie,
  writeNonceCookie,
  clearNonceCookie,
} from "../services/session.js";

const auth = new Hono();

function randomNonce() {
  const bytes = crypto.getRandomValues(new Uint8Array(16));
  return btoa(String.fromCharCode(...bytes))
    .replace(/\+/g, "-")
    .replace(/\//g, "_")
    .replace(/=+$/, "");
}

// Issue a one-time nonce (and the public Google client ID, so the browser needs
// no per-environment build setting). The browser passes it to Google, Google embeds it in
// the ID token, and /google checks it against this cookie, so a stolen token
// can't be replayed from another browser.
auth.get("/nonce", (c) => {
  const nonce = randomNonce();
  writeNonceCookie(c, nonce);
  c.header("Cache-Control", "no-store");
  return c.json({ nonce, clientId: c.env.GOOGLE_CLIENT_ID });
});

auth.post("/google", async (c) => {
  const body = await c.req.json().catch(() => null);
  const credential = body?.credential;
  if (typeof credential !== "string" || !credential) {
    throw new ApiError(400, "bad_request", "Missing credential.");
  }

  const identity = await verifyGoogleIdToken(credential, {
    clientId: c.env.GOOGLE_CLIENT_ID,
    nonce: readNonceCookie(c),
    keySet: c.get("googleKeySet"),
  });
  clearNonceCookie(c);

  const user = await upsertGoogleUser(c.env.DB, identity);
  await writeSessionCookie(c, user.id);
  return c.json({ user });
});

// 200 with `user: null` for guests (rather than 401) so a signed-out page load
// doesn't log a failed request in the console.
auth.get("/me", async (c) => {
  c.header("Cache-Control", "no-store");
  const session = await verifySession(c.env.SESSION_SECRET, readSessionCookie(c));
  if (!session) return c.json({ user: null });

  const user = await getUserById(c.env.DB, session.userId);
  if (!user) {
    clearSessionCookie(c);
    return c.json({ user: null });
  }
  if (session.needsRefresh) await writeSessionCookie(c, user.id);
  return c.json({ user });
});

auth.post("/logout", (c) => {
  clearSessionCookie(c);
  return c.body(null, 204);
});

export default auth;
