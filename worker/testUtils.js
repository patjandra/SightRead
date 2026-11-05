import { SignJWT, generateKeyPair } from "jose";
import { createRequire } from "node:module";
import { readdirSync, readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { signSession } from "./services/session.js";
import { upsertGoogleUser } from "./services/users.js";

export const CLIENT_ID = "test-client.apps.googleusercontent.com";
export const SESSION_SECRET = "test-session-secret-test-session-secret";
// 32 bytes, base64url.
export const SPOTIFY_TOKEN_KEY = "AAECAwQFBgcICQoLDA0ODxAREhMUFRYXGBkaGxwdHh8";
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

// Vite strips the `node:` prefix and then fails to resolve a bare `sqlite`, so
// load the built-in through require (needs Node >= 22.13, matching CI).
const { DatabaseSync } = createRequire(import.meta.url)("node:sqlite");

const MIGRATIONS_DIR = fileURLToPath(new URL("../migrations/", import.meta.url));

/**
 * A D1-shaped wrapper over a real in-memory SQLite database with every
 * migration applied, so tests exercise the actual SQL and schema (including
 * foreign keys and primary keys). `raw` is the underlying DatabaseSync.
 */
export function sqliteD1() {
  const raw = new DatabaseSync(":memory:");
  for (const file of readdirSync(MIGRATIONS_DIR).filter((f) => f.endsWith(".sql")).sort()) {
    raw.exec(readFileSync(MIGRATIONS_DIR + file, "utf8"));
  }
  const plain = (row) => (row ? { ...row } : null);

  return {
    raw,
    prepare(sql) {
      const stmt = raw.prepare(sql);
      return {
        bind(...args) {
          return {
            async first() {
              return plain(stmt.get(...args));
            },
            async all() {
              return { results: stmt.all(...args).map(plain) };
            },
            async run() {
              const info = stmt.run(...args);
              return { meta: { changes: Number(info.changes) } };
            },
          };
        },
      };
    },
  };
}

/** Create a user row and a valid session cookie for them. */
export async function makeUser(db, sub, email = `${sub}@example.com`) {
  const user = await upsertGoogleUser(db, { sub, email, name: sub, picture: null });
  const token = await signSession(SESSION_SECRET, user.id);
  return { ...user, cookie: `__Host-sr_session=${token}` };
}

/** An in-memory stand-in for an R2 bucket (put/get/delete/list by prefix). */
export function fakeR2() {
  const objects = new Map();
  return {
    objects,
    async put(key, value) {
      objects.set(key, new Uint8Array(value));
    },
    async get(key) {
      const bytes = objects.get(key);
      return bytes ? { body: new Blob([bytes]).stream() } : null;
    },
    async delete(keys) {
      for (const key of Array.isArray(keys) ? keys : [keys]) objects.delete(key);
    },
    async list({ prefix = "" } = {}) {
      return {
        objects: [...objects.keys()].filter((k) => k.startsWith(prefix)).map((key) => ({ key })),
        truncated: false,
      };
    },
  };
}

export function env(db, bucket = fakeR2()) {
  return {
    DB: db,
    PDFS: bucket,
    GOOGLE_CLIENT_ID: CLIENT_ID,
    SESSION_SECRET,
    SPOTIFY_CLIENT_ID: "spotify-client",
    SPOTIFY_TOKEN_KEY,
  };
}
