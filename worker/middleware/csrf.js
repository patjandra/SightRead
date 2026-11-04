import { ApiError } from "../errors.js";

const SAFE_METHODS = new Set(["GET", "HEAD", "OPTIONS"]);

/**
 * CSRF defence for state-changing requests, on top of SameSite=Lax cookies:
 * the Origin header must match the host being called, and a custom header must
 * be present (a cross-site form post can't set one).
 *
 * `ALLOWED_ORIGINS` (comma-separated origins) is for local dev only: Vite serves
 * the UI on :5173 and proxies to the Worker on :8787, so the browser's Origin
 * never matches the Worker's own host. It is unset in staging and production.
 */
export async function csrf(c, next) {
  if (SAFE_METHODS.has(c.req.method)) return next();

  const origin = c.req.header("Origin");
  let originHost = null;
  try {
    originHost = origin ? new URL(origin).host : null;
  } catch {
    originHost = null;
  }
  const extra = (c.env.ALLOWED_ORIGINS ?? "")
    .split(",")
    .map((o) => o.trim())
    .filter(Boolean);
  const allowed = !!origin && (originHost === new URL(c.req.url).host || extra.includes(origin));
  if (!originHost || !allowed) {
    throw new ApiError(403, "csrf_origin", "Cross-origin request rejected.");
  }
  if (c.req.header("X-Requested-With") !== "sightread") {
    throw new ApiError(403, "csrf_header", "Missing required request header.");
  }
  return next();
}
