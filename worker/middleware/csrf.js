import { ApiError } from "../errors.js";

const SAFE_METHODS = new Set(["GET", "HEAD", "OPTIONS"]);

/**
 * CSRF defence for state-changing requests, on top of SameSite=Lax cookies:
 * the Origin header must match the host being called, and a custom header must
 * be present (a cross-site form post can't set one).
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
  if (!originHost || originHost !== new URL(c.req.url).host) {
    throw new ApiError(403, "csrf_origin", "Cross-origin request rejected.");
  }
  if (c.req.header("X-Requested-With") !== "sightread") {
    throw new ApiError(403, "csrf_header", "Missing required request header.");
  }
  return next();
}
