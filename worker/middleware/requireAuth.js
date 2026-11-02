import { ApiError } from "../errors.js";
import { readSessionCookie, verifySession } from "../services/session.js";

/** Rejects unauthenticated requests; on success sets `userId` on the context. */
export async function requireAuth(c, next) {
  const session = await verifySession(c.env.SESSION_SECRET, readSessionCookie(c));
  if (!session) throw new ApiError(401, "unauthenticated", "Sign in required.");
  c.set("userId", session.userId);
  return next();
}
