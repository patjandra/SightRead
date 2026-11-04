import { describe, it, expect, beforeAll } from "vitest";
import { createApp } from "./index.js";
import { CLIENT_ID, ORIGIN, env, sqliteD1, makeGoogleKeys, makeIdToken } from "./testUtils.js";

let keys;
beforeAll(async () => {
  keys = await makeGoogleKeys();
});

const userCount = (db) => db.raw.prepare("SELECT COUNT(*) AS n FROM users").get().n;

function setup(extraEnv = {}) {
  const db = sqliteD1();
  const app = createApp({ googleKeySet: keys.publicKey });
  const call = (path, { method = "GET", headers = {}, body, cookie } = {}) =>
    app.request(
      `${ORIGIN}${path}`,
      {
        method,
        headers: {
          ...(method !== "GET" && { Origin: ORIGIN, "X-Requested-With": "sightread", "Content-Type": "application/json" }),
          ...(cookie && { Cookie: cookie }),
          ...headers,
        },
        body: body ? JSON.stringify(body) : undefined,
      },
      { ...env(db), ...extraEnv }
    );
  return { db, call };
}

// Pull "name=value" pairs out of Set-Cookie headers into a Cookie header value.
function cookiesFrom(res) {
  return res.headers
    .getSetCookie()
    .map((c) => c.split(";")[0])
    .filter((c) => !c.endsWith("="))
    .join("; ");
}

async function signIn({ call }, claims = {}, overrides = {}) {
  const nonceRes = await call("/api/auth/nonce");
  const { nonce } = await nonceRes.json();
  const credential = await makeIdToken(keys.privateKey, overrides, { nonce, ...claims });
  return call("/api/auth/google", {
    method: "POST",
    cookie: cookiesFrom(nonceRes),
    body: { credential },
  });
}

describe("auth routes", () => {
  it("issues a nonce in a __Host- HttpOnly cookie", async () => {
    const { call } = setup();
    const res = await call("/api/auth/nonce");
    const setCookie = res.headers.getSetCookie()[0];
    expect(setCookie).toMatch(/^__Host-sr_nonce=/);
    expect(setCookie).toMatch(/HttpOnly/i);
    expect(setCookie).toMatch(/Secure/i);
    expect(setCookie).toMatch(/SameSite=Lax/i);
    const body = await res.json();
    expect(body.nonce).toBeTruthy();
    expect(body.clientId).toBe(CLIENT_ID);
  });

  it("creates a user and a session on first sign-in", async () => {
    const ctx = setup();
    const res = await signIn(ctx);
    expect(res.status).toBe(200);
    const { user } = await res.json();
    expect(user.email).toBe("ada@example.com");
    expect(user.id).toMatch(/^[0-9a-f-]{36}$/);
    expect(userCount(ctx.db)).toBe(1);

    const session = res.headers.getSetCookie().find((c) => c.startsWith("__Host-sr_session="));
    expect(session).toMatch(/HttpOnly/i);
    expect(session).toMatch(/Max-Age=2592000/);
  });

  it("reuses the same UUID when a returning user signs in", async () => {
    const ctx = setup();
    const first = (await (await signIn(ctx)).json()).user;
    const second = (await (await signIn(ctx)).json()).user;
    expect(second.id).toBe(first.id);
    expect(userCount(ctx.db)).toBe(1);
  });

  it("rejects a sign-in with no nonce cookie", async () => {
    const { call } = setup();
    const credential = await makeIdToken(keys.privateKey);
    const res = await call("/api/auth/google", { method: "POST", body: { credential } });
    expect(res.status).toBe(401);
    expect((await res.json()).error.code).toBe("invalid_nonce");
  });

  it("rejects a missing credential", async () => {
    const { call } = setup();
    const res = await call("/api/auth/google", { method: "POST", body: {} });
    expect(res.status).toBe(400);
  });

  it("/me returns null for guests and the user for a signed-in session", async () => {
    const ctx = setup();
    expect(await (await ctx.call("/api/auth/me")).json()).toEqual({ user: null });

    const signedIn = await signIn(ctx);
    const me = await ctx.call("/api/auth/me", { cookie: cookiesFrom(signedIn) });
    expect((await me.json()).user.email).toBe("ada@example.com");
  });

  it("/me treats a session for a deleted user as signed out", async () => {
    const ctx = setup();
    const signedIn = await signIn(ctx);
    ctx.db.raw.exec("DELETE FROM users");
    const me = await ctx.call("/api/auth/me", { cookie: cookiesFrom(signedIn) });
    expect(await me.json()).toEqual({ user: null });
  });

  it("logout clears the session cookie", async () => {
    const { call } = setup();
    const res = await call("/api/auth/logout", { method: "POST" });
    expect(res.status).toBe(204);
    expect(res.headers.getSetCookie().join(";")).toMatch(/__Host-sr_session=;/);
  });
});

describe("INSECURE_DEV_COOKIES (Safari on http://localhost)", () => {
  // The app is exercised through a real localhost URL here, since the flag only
  // applies to local hosts.
  function localSetup(extraEnv) {
    const db = sqliteD1();
    const app = createApp({ googleKeySet: keys.publicKey });
    const origin = "http://localhost:5173";
    const call = (path, { method = "GET", cookie, body } = {}) =>
      app.request(
        `http://localhost:5173${path}`,
        {
          method,
          headers: {
            ...(method !== "GET" && { Origin: origin, "X-Requested-With": "sightread", "Content-Type": "application/json" }),
            ...(cookie && { Cookie: cookie }),
          },
          body: body ? JSON.stringify(body) : undefined,
        },
        { ...env(db), ...extraEnv }
      );
    return { call };
  }

  it("issues plain, non-Secure cookies on localhost so Safari keeps them", async () => {
    const { call } = localSetup({ INSECURE_DEV_COOKIES: "true" });
    const res = await call("/api/auth/nonce");
    const cookie = res.headers.getSetCookie()[0];
    expect(cookie).toMatch(/^sr_nonce=/);
    expect(cookie).not.toMatch(/Secure/i);
    expect(cookie).toMatch(/HttpOnly/i);
    expect(cookie).toMatch(/SameSite=Lax/i);
  });

  it("completes a full sign-in and session round trip with those cookies", async () => {
    const { call } = localSetup({ INSECURE_DEV_COOKIES: "true" });
    const nonceRes = await call("/api/auth/nonce");
    const { nonce } = await nonceRes.json();
    const credential = await makeIdToken(keys.privateKey, {}, { nonce });
    const signed = await call("/api/auth/google", { method: "POST", cookie: cookiesFrom(nonceRes), body: { credential } });
    expect(signed.status).toBe(200);
    expect(signed.headers.getSetCookie().find((c) => c.startsWith("sr_session="))).toBeTruthy();

    const me = await call("/api/auth/me", { cookie: cookiesFrom(signed) });
    expect((await me.json()).user.email).toBe("ada@example.com");
  });

  it("is ignored for any non-local host, even if the flag is set", async () => {
    const { call } = setup({ INSECURE_DEV_COOKIES: "true" }); // https://sightread.test
    const res = await call("/api/auth/nonce");
    const cookie = res.headers.getSetCookie()[0];
    expect(cookie).toMatch(/^__Host-sr_nonce=/);
    expect(cookie).toMatch(/Secure/i);
  });

  it("stays hardened on localhost when the flag is not set", async () => {
    const { call } = localSetup({});
    const cookie = (await call("/api/auth/nonce")).headers.getSetCookie()[0];
    expect(cookie).toMatch(/^__Host-sr_nonce=/);
    expect(cookie).toMatch(/Secure/i);
  });
});

describe("csrf protection", () => {
  it("rejects a POST without the custom header", async () => {
    const { call } = setup();
    const res = await call("/api/auth/logout", { method: "POST", headers: { "X-Requested-With": "" } });
    expect(res.status).toBe(403);
    expect((await res.json()).error.code).toBe("csrf_header");
  });

  it("rejects a POST from another origin", async () => {
    const { call } = setup();
    const res = await call("/api/auth/logout", { method: "POST", headers: { Origin: "https://evil.example" } });
    expect(res.status).toBe(403);
    expect((await res.json()).error.code).toBe("csrf_origin");
  });
});

describe("ALLOWED_ORIGINS (local dev)", () => {
  it("accepts a listed origin and still rejects others", async () => {
    const { call } = setup({ ALLOWED_ORIGINS: "http://localhost:5173" });
    const ok = await call("/api/auth/logout", { method: "POST", headers: { Origin: "http://localhost:5173" } });
    expect(ok.status).toBe(204);
    const bad = await call("/api/auth/logout", { method: "POST", headers: { Origin: "https://evil.example" } });
    expect(bad.status).toBe(403);
  });
});

describe("misc", () => {
  it("returns a JSON 404 for unknown API routes", async () => {
    const { call } = setup();
    const res = await call("/api/nope");
    expect(res.status).toBe(404);
    expect((await res.json()).error.code).toBe("not_found");
  });
});
