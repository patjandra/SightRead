// PKCE helpers (RFC 7636) for the Spotify login. Uses the browser's own crypto,
// so no secret ever has to ship with the app.

function base64url(bytes) {
  let binary = "";
  for (const b of bytes) binary += String.fromCharCode(b);
  return btoa(binary).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
}

/** A random string of `bytes` bytes of entropy, URL-safe. */
export function randomString(bytes = 32) {
  return base64url(crypto.getRandomValues(new Uint8Array(bytes)));
}

/** The code verifier: 43 URL-safe characters from 32 random bytes. */
export function generateVerifier() {
  return randomString(32);
}

/** S256 code challenge for a verifier. */
export async function challengeFor(verifier) {
  const digest = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(verifier));
  return base64url(new Uint8Array(digest));
}
