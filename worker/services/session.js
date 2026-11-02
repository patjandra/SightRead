import { SignJWT, jwtVerify } from "jose";
import { getCookie, setCookie, deleteCookie } from "hono/cookie";

// hono's `prefix: "host"` produces the `__Host-` cookie prefix, which browsers
// only accept when the cookie is Secure, Path=/ and has no Domain attribute.
// Safari won't store Secure cookies over plain http://localhost (Chrome will),
// so local dev can opt out; see cookieSettings().
const SESSION_COOKIE = "sr_session";
const NONCE_COOKIE = "sr_nonce";

const DAY = 24 * 60 * 60;
export const SESSION_TTL_SEC = 30 * DAY;
// Re-issue the session once it is older than this, so active users stay signed
// in (sliding window) without writing a cookie on every request.
const REFRESH_AFTER_SEC = 1 * DAY;
const NONCE_TTL_SEC = 5 * 60;

const hardenedCookie = { prefix: "host", httpOnly: true, secure: true, sameSite: "Lax", path: "/" };
const devCookie = { httpOnly: true, secure: false, sameSite: "Lax", path: "/" };

const LOCAL_HOSTS = new Set(["localhost", "127.0.0.1", "[::1]"]);

/**
 * Cookie attributes for this request. Always the hardened `__Host-` + Secure
 * set, unless INSECURE_DEV_COOKIES=true AND the request is to a local host, so
 * the flag is inert if it is ever set outside local development.
 */
function cookieSettings(c) {
  const local = LOCAL_HOSTS.has(new URL(c.req.url).hostname);
  return c.env.INSECURE_DEV_COOKIES === "true" && local ? devCookie : hardenedCookie;
}

const MIN_SECRET_LENGTH = 32;

const key = (secret) => {
  if (typeof secret !== "string" || secret.length < MIN_SECRET_LENGTH) {
    throw new Error(`SESSION_SECRET must be set and at least ${MIN_SECRET_LENGTH} characters`);
  }
  return new TextEncoder().encode(secret);
};

export async function signSession(secret, userId, now = Date.now()) {
  const iat = Math.floor(now / 1000);
  return new SignJWT({})
    .setProtectedHeader({ alg: "HS256" })
    .setSubject(userId)
    .setIssuedAt(iat)
    .setExpirationTime(iat + SESSION_TTL_SEC)
    .sign(key(secret));
}

/** @returns {{ userId: string, needsRefresh: boolean } | null} */
export async function verifySession(secret, token, now = Date.now()) {
  if (!token) return null;
  try {
    const { payload } = await jwtVerify(token, key(secret), {
      algorithms: ["HS256"],
      currentDate: new Date(now),
    });
    if (!payload.sub) return null;
    const age = Math.floor(now / 1000) - (payload.iat ?? 0);
    return { userId: payload.sub, needsRefresh: age > REFRESH_AFTER_SEC };
  } catch {
    return null;
  }
}

export function readSessionCookie(c) {
  return getCookie(c, SESSION_COOKIE, cookieSettings(c).prefix);
}

export async function writeSessionCookie(c, userId) {
  const token = await signSession(c.env.SESSION_SECRET, userId);
  setCookie(c, SESSION_COOKIE, token, { ...cookieSettings(c), maxAge: SESSION_TTL_SEC });
}

export function clearSessionCookie(c) {
  deleteCookie(c, SESSION_COOKIE, cookieSettings(c));
}

export function readNonceCookie(c) {
  return getCookie(c, NONCE_COOKIE, cookieSettings(c).prefix);
}

export function writeNonceCookie(c, nonce) {
  setCookie(c, NONCE_COOKIE, nonce, { ...cookieSettings(c), maxAge: NONCE_TTL_SEC });
}

export function clearNonceCookie(c) {
  deleteCookie(c, NONCE_COOKIE, cookieSettings(c));
}
