import { Hono } from "hono";
import { requireAuth } from "../middleware/requireAuth.js";
import { clearSessionCookie } from "../services/session.js";
import { deleteAllPdfs } from "../services/pdfs.js";
import { deleteLink } from "../services/spotifyLink.js";

const account = new Hono();

account.use("*", requireAuth);

// Permanently removes the signed-in user and everything stored for them.
// Objects go first: if this fails midway the rows still point at what is left
// and the user can retry.
account.delete("/", async (c) => {
  const userId = c.get("userId");
  await deleteAllPdfs(c.env, userId);
  await c.env.DB.prepare("DELETE FROM calibration_profiles WHERE user_id = ?").bind(userId).run();
  await deleteLink(c.env.DB, userId);
  await c.env.DB.prepare("DELETE FROM users WHERE id = ?").bind(userId).run();
  clearSessionCookie(c);
  return c.body(null, 204);
});

export default account;
