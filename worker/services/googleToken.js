import { createRemoteJWKSet, jwtVerify } from "jose";
import { ApiError } from "../errors.js";

const GOOGLE_ISSUERS = ["https://accounts.google.com", "accounts.google.com"];
const GOOGLE_JWKS = createRemoteJWKSet(
  new URL("https://www.googleapis.com/oauth2/v3/certs")
);

/**
 * Verify a Google Identity Services ID token and return the identity in it.
 *
 * Checks signature (RS256), issuer, audience, expiry, that the nonce matches the
 * one we issued to this browser, and that Google verified the email.
 *
 * `keySet` is injectable so tests can use a local key instead of Google's JWKS.
 */
export async function verifyGoogleIdToken(
  idToken,
  { clientId, nonce, keySet = GOOGLE_JWKS }
) {
  // jose skips the `aud` check entirely when `audience` is undefined, which
  // would accept ID tokens minted for any other Google app. Fail closed.
  if (!clientId || clientId.startsWith("REPLACE_WITH")) {
    console.error("[sightread] GOOGLE_CLIENT_ID is not configured");
    throw new ApiError(500, "misconfigured", "Sign-in is not available.");
  }

  let payload;
  try {
    ({ payload } = await jwtVerify(idToken, keySet, {
      issuer: GOOGLE_ISSUERS,
      audience: clientId,
      algorithms: ["RS256"],
    }));
  } catch {
    throw new ApiError(401, "invalid_token", "Google sign-in could not be verified.");
  }

  if (!nonce || payload.nonce !== nonce) {
    throw new ApiError(401, "invalid_nonce", "Sign-in expired. Please try again.");
  }
  if (!payload.sub) {
    throw new ApiError(401, "invalid_token", "Google sign-in could not be verified.");
  }
  if (payload.email_verified !== true || !payload.email) {
    throw new ApiError(403, "email_unverified", "Your Google email address is not verified.");
  }

  return {
    sub: payload.sub,
    email: payload.email,
    name: payload.name ?? null,
    picture: payload.picture ?? null,
  };
}
