import { SignJWT, generateKeyPair } from "jose";

export const CLIENT_ID = "test-client.apps.googleusercontent.com";
export const SESSION_SECRET = "test-session-secret-test-session-secret";
export const ORIGIN = "https://sightread.test";

/** A local RSA key pair standing in for Google's signing keys. */
export async function makeGoogleKeys() {
  return generateKeyPair("RS256");
}

export async function makeIdToken(privateKey, overrides = {}, claims = {}) {
  const now = Math.floor(Date.now() / 1000);
  return new SignJWT({
    nonce: "nonce-1",
    email: "ada@example.com",
    email_verified: true,
    name: "Ada",
    picture: "https://example.com/ada.png",
    ...claims,
  })
    .setProtectedHeader({ alg: "RS256" })
    .setIssuer(overrides.iss ?? "https://accounts.google.com")
    .setAudience(overrides.aud ?? CLIENT_ID)
    .setSubject(overrides.sub ?? "google-sub-1")
    .setIssuedAt(now)
    .setExpirationTime(overrides.exp ?? now + 3600)
    .sign(privateKey);
}

/** In-memory stand-in for the two D1 statements the users service issues. */
export function fakeDb() {
  const bySub = new Map();
  return {
    users: bySub,
    prepare(sql) {
      return {
        bind(...args) {
          return {
            async first() {
              if (sql.includes("INSERT INTO users")) {
                const [id, sub, email, name, picture, createdAt, lastLoginAt] = args;
                const existing = bySub.get(sub);
                if (existing) {
                  Object.assign(existing, { email, name, picture, last_login_at: lastLoginAt });
                } else {
                  bySub.set(sub, { id, google_sub: sub, email, name, picture, created_at: createdAt, last_login_at: lastLoginAt });
                }
                const u = bySub.get(sub);
                return { id: u.id, email: u.email, name: u.name, picture: u.picture };
              }
              if (sql.includes("WHERE id = ?")) {
                const u = [...bySub.values()].find((x) => x.id === args[0]);
                return u ? { id: u.id, email: u.email, name: u.name, picture: u.picture } : null;
              }
              throw new Error("unexpected SQL in fakeDb: " + sql);
            },
          };
        },
      };
    },
  };
}

export function env(db) {
  return { DB: db, GOOGLE_CLIENT_ID: CLIENT_ID, SESSION_SECRET };
}
