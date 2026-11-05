import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";
import { createApp } from "../index.js";
import { ORIGIN, env, makeUser, sqliteD1 } from "../testUtils.js";

let db, app, alice, bob;

beforeEach(async () => {
  db = sqliteD1();
  app = createApp();
  alice = await makeUser(db, "alice");
  bob = await makeUser(db, "bob");
});
afterEach(() => vi.unstubAllGlobals());

function call(user, path, { method = "GET", body } = {}) {
  const headers = {
    ...(user && { Cookie: user.cookie }),
    ...(method !== "GET" && { Origin: ORIGIN, "X-Requested-With": "sightread" }),
    ...(body && { "Content-Type": "application/json" }),
  };
  return app.request(
    `${ORIGIN}${path}`,
    { method, headers, body: body ? JSON.stringify(body) : undefined },
    env(db)
  );
}
const link = (user, refreshToken) => call(user, "/api/spotify/link", { method: "PUT", body: { refreshToken } });

function stubSpotify(status, json = {}) {
  const fn = vi.fn().mockResolvedValue({ ok: status < 400, status, json: async () => json });
  vi.stubGlobal("fetch", fn);
  return fn;
}
const stored = (user) =>
  db.raw.prepare("SELECT refresh_token_enc FROM spotify_links WHERE user_id = ?").get(user.id) ?? null;

describe("spotify routes", () => {
  it("rejects everything when signed out", async () => {
    expect((await link(null, "r")).status).toBe(401);
    expect((await call(null, "/api/spotify/token")).status).toBe(401);
    expect((await call(null, "/api/spotify/link", { method: "DELETE" })).status).toBe(401);
  });

  it("stores the refresh token encrypted, not in plaintext", async () => {
    expect((await link(alice, "REFRESH-123")).status).toBe(204);
    const row = stored(alice);
    expect(row.refresh_token_enc).toBeTruthy();
    expect(row.refresh_token_enc).not.toContain("REFRESH-123");
  });

  it("validates the token", async () => {
    expect((await link(alice, "")).status).toBe(400);
    expect((await link(alice, 42)).status).toBe(400);
    expect((await link(alice, "x".repeat(3000))).status).toBe(400);
  });

  it("returns 404 when nothing is remembered", async () => {
    const res = await call(alice, "/api/spotify/token");
    expect(res.status).toBe(404);
  });

  it("mints an access token and never returns the refresh token", async () => {
    await link(alice, "REFRESH-123");
    const fetchMock = stubSpotify(200, { access_token: "ACCESS", expires_in: 3600 });
    const res = await call(alice, "/api/spotify/token");
    expect(await res.json()).toEqual({ accessToken: "ACCESS", expiresIn: 3600 });
    expect(res.headers.get("Cache-Control")).toBe("no-store");
    const sent = fetchMock.mock.calls[0][1].body.toString();
    expect(sent).toContain("refresh_token=REFRESH-123");
    expect(sent).toContain("client_id=spotify-client");
    expect(sent).not.toContain("client_secret");
  });

  it("keeps a rotated refresh token", async () => {
    await link(alice, "OLD");
    const before = stored(alice).refresh_token_enc;
    stubSpotify(200, { access_token: "A", refresh_token: "NEW", expires_in: 3600 });
    await call(alice, "/api/spotify/token");
    expect(stored(alice).refresh_token_enc).not.toBe(before);
    const fetchMock = stubSpotify(200, { access_token: "A2", expires_in: 3600 });
    await call(alice, "/api/spotify/token");
    expect(fetchMock.mock.calls[0][1].body.toString()).toContain("refresh_token=NEW");
  });

  it("drops the link when Spotify says the grant is gone", async () => {
    await link(alice, "REVOKED");
    stubSpotify(400, { error: "invalid_grant" });
    expect((await call(alice, "/api/spotify/token")).status).toBe(404);
    expect(stored(alice)).toBeNull();
  });

  it("reports a retryable error when Spotify is down, keeping the link", async () => {
    await link(alice, "R");
    stubSpotify(503);
    expect((await call(alice, "/api/spotify/token")).status).toBe(502);
    expect(stored(alice)).toBeTruthy();
  });

  it("keeps users apart", async () => {
    await link(alice, "ALICE");
    expect((await call(bob, "/api/spotify/token")).status).toBe(404);
    await call(bob, "/api/spotify/link", { method: "DELETE" });
    expect(stored(alice)).toBeTruthy();
  });

  it("deletes the link on Disconnect and with the account", async () => {
    await link(alice, "A");
    await call(alice, "/api/spotify/link", { method: "DELETE" });
    expect(stored(alice)).toBeNull();

    await link(bob, "B");
    expect((await call(bob, "/api/account", { method: "DELETE" })).status).toBe(204);
    expect(stored(bob)).toBeNull();
  });

  it("requires the CSRF headers on writes", async () => {
    const res = await app.request(
      `${ORIGIN}/api/spotify/link`,
      { method: "PUT", headers: { Cookie: alice.cookie, "Content-Type": "application/json" }, body: JSON.stringify({ refreshToken: "x" }) },
      env(db)
    );
    expect(res.status).toBe(403);
  });
});
