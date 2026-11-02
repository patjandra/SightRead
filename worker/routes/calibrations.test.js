import { describe, it, expect, beforeEach } from "vitest";
import { createApp } from "../index.js";
import { ORIGIN, env, makeUser, sqliteD1 } from "../testUtils.js";
import { MAX_PROFILES_PER_USER } from "../services/calibrations.js";

const ID_1 = "11111111-1111-4111-8111-111111111111";
const ID_2 = "22222222-2222-4222-8222-222222222222";
const T0 = "2026-11-01T10:00:00.000Z";
const T1 = "2026-11-01T11:00:00.000Z";
const T2 = "2026-11-01T12:00:00.000Z";

const profileBody = (over = {}) => ({
  name: "Desk",
  points: { top: 0.1, center: 0.5, bottom: 0.9 },
  calibrationVersion: 5,
  createdAt: T0,
  updatedAt: T0,
  ...over,
});

let db, app, alice, bob;

beforeEach(async () => {
  db = sqliteD1();
  app = createApp();
  alice = await makeUser(db, "alice");
  bob = await makeUser(db, "bob");
});

function call(user, path, { method = "GET", body } = {}) {
  return app.request(
    `${ORIGIN}/api/calibrations${path}`,
    {
      method,
      headers: {
        ...(user && { Cookie: user.cookie }),
        ...(method !== "GET" && { Origin: ORIGIN, "X-Requested-With": "sightread", "Content-Type": "application/json" }),
      },
      body: body === undefined ? undefined : JSON.stringify(body),
    },
    env(db)
  );
}

const put = (user, id, body) => call(user, `/${id}`, { method: "PUT", body });
const list = async (user) => (await (await call(user, "")).json()).profiles;

describe("authentication", () => {
  it("rejects every route when signed out", async () => {
    expect((await call(null, "")).status).toBe(401);
    expect((await put(null, ID_1, profileBody())).status).toBe(401);
    expect((await call(null, `/${ID_1}`, { method: "DELETE" })).status).toBe(401);
  });

  it("requires the CSRF headers on writes", async () => {
    const res = await app.request(
      `${ORIGIN}/api/calibrations/${ID_1}`,
      { method: "PUT", headers: { Cookie: alice.cookie, "Content-Type": "application/json" }, body: JSON.stringify(profileBody()) },
      env(db)
    );
    expect(res.status).toBe(403);
  });
});

describe("create, read, update", () => {
  it("creates and lists a profile", async () => {
    const res = await put(alice, ID_1, profileBody());
    expect(res.status).toBe(200);
    expect((await res.json()).profile).toEqual({
      id: ID_1,
      name: "Desk",
      points: { top: 0.1, center: 0.5, bottom: 0.9 },
      calibrationVersion: 5,
      createdAt: T0,
      updatedAt: T0,
      deletedAt: null,
    });
    expect(await list(alice)).toHaveLength(1);
  });

  it("stores an uncalibrated profile with null points", async () => {
    await put(alice, ID_1, profileBody({ points: null, calibrationVersion: null }));
    const [p] = await list(alice);
    expect(p.points).toBeNull();
    expect(p.calibrationVersion).toBeNull();
  });

  it("is idempotent for the same payload", async () => {
    await put(alice, ID_1, profileBody());
    await put(alice, ID_1, profileBody());
    expect(await list(alice)).toHaveLength(1);
  });

  it("applies a newer update", async () => {
    await put(alice, ID_1, profileBody());
    const res = await put(alice, ID_1, profileBody({ name: "Piano", updatedAt: T1 }));
    expect((await res.json()).profile).toMatchObject({ name: "Piano", updatedAt: T1 });
  });

  it("ignores an older update and returns the winning record", async () => {
    await put(alice, ID_1, profileBody({ name: "New", updatedAt: T2 }));
    const res = await put(alice, ID_1, profileBody({ name: "Stale", updatedAt: T1 }));
    expect((await res.json()).profile).toMatchObject({ name: "New", updatedAt: T2 });
    expect((await list(alice))[0].name).toBe("New");
  });

  it("normalizes the id to lowercase", async () => {
    await put(alice, ID_1.toUpperCase(), profileBody());
    expect((await list(alice))[0].id).toBe(ID_1);
  });
});

describe("isolation between users", () => {
  it("never lists another user's profiles", async () => {
    await put(alice, ID_1, profileBody());
    expect(await list(bob)).toEqual([]);
  });

  it("lets two users hold the same profile id independently", async () => {
    await put(alice, ID_1, profileBody({ name: "Alice's" }));
    await put(bob, ID_1, profileBody({ name: "Bob's" }));
    expect((await list(alice))[0].name).toBe("Alice's");
    expect((await list(bob))[0].name).toBe("Bob's");
  });

  it("cannot be used to overwrite another user's profile", async () => {
    await put(alice, ID_1, profileBody({ name: "Alice's" }));
    await put(bob, ID_1, profileBody({ name: "Hijack", updatedAt: T2 }));
    expect((await list(alice))[0]).toMatchObject({ name: "Alice's", updatedAt: T0 });
  });

  it("cannot delete another user's profile", async () => {
    await put(alice, ID_1, profileBody());
    const res = await call(bob, `/${ID_1}`, { method: "DELETE" });
    expect(res.status).toBe(404);
    expect((await list(alice))[0].deletedAt).toBeNull();
  });
});

describe("deletes", () => {
  it("soft-deletes and still lists the tombstone", async () => {
    await put(alice, ID_1, profileBody());
    const res = await call(alice, `/${ID_1}`, { method: "DELETE" });
    expect(res.status).toBe(200);
    const [p] = await list(alice);
    expect(p.deletedAt).toBeTruthy();
    expect(p.updatedAt).toBe(p.deletedAt);
  });

  it("is idempotent", async () => {
    await put(alice, ID_1, profileBody());
    await call(alice, `/${ID_1}`, { method: "DELETE" });
    expect((await call(alice, `/${ID_1}`, { method: "DELETE" })).status).toBe(200);
  });

  it("404s for an unknown profile", async () => {
    expect((await call(alice, `/${ID_2}`, { method: "DELETE" })).status).toBe(404);
  });

  it("never resurrects a deleted profile, even with a newer update", async () => {
    await put(alice, ID_1, profileBody());
    await call(alice, `/${ID_1}`, { method: "DELETE" });
    // Strictly newer than the delete, but within the allowed clock skew.
    const newer = new Date(Date.now() + 60_000).toISOString();
    const res = await put(alice, ID_1, profileBody({ name: "Zombie", updatedAt: newer }));
    expect((await res.json()).profile.deletedAt).toBeTruthy();
    expect((await list(alice))[0].name).toBe("Desk");
  });

  it("does not count deleted profiles toward the cap", async () => {
    for (let i = 0; i < MAX_PROFILES_PER_USER; i++) {
      await put(alice, `00000000-0000-4000-8000-${String(i).padStart(12, "0")}`, profileBody({ name: `p${i}` }));
    }
    expect((await put(alice, ID_2, profileBody())).status).toBe(409);
    await call(alice, `/00000000-0000-4000-8000-${String(0).padStart(12, "0")}`, { method: "DELETE" });
    expect((await put(alice, ID_2, profileBody())).status).toBe(200);
  });
});

describe("limits and validation", () => {
  it("returns 409 profile_limit past the cap, but still allows updating existing ones", async () => {
    for (let i = 0; i < MAX_PROFILES_PER_USER; i++) {
      await put(alice, `00000000-0000-4000-8000-${String(i).padStart(12, "0")}`, profileBody({ name: `p${i}` }));
    }
    const over = await put(alice, ID_1, profileBody());
    expect(over.status).toBe(409);
    expect((await over.json()).error.code).toBe("profile_limit");

    const existing = "00000000-0000-4000-8000-000000000001";
    expect((await put(alice, existing, profileBody({ name: "renamed", updatedAt: T1 }))).status).toBe(200);
  });

  it.each([
    ["a non-UUID id", () => put(alice, "not-a-uuid", profileBody()), "invalid_id"],
    ["an empty name", () => put(alice, ID_1, profileBody({ name: "   " })), "invalid_profile"],
    ["a name over 100 chars", () => put(alice, ID_1, profileBody({ name: "x".repeat(101) })), "invalid_profile"],
    ["a non-string name", () => put(alice, ID_1, profileBody({ name: 5 })), "invalid_profile"],
    ["partial points", () => put(alice, ID_1, profileBody({ points: { top: 0.1 } })), "invalid_profile"],
    ["NaN-like points", () => put(alice, ID_1, profileBody({ points: { top: "0.1", center: 0.5, bottom: 0.9 } })), "invalid_profile"],
    ["huge points", () => put(alice, ID_1, profileBody({ points: { top: 1e9, center: 0.5, bottom: 0.9 } })), "invalid_profile"],
    ["a fractional version", () => put(alice, ID_1, profileBody({ calibrationVersion: 1.5 })), "invalid_profile"],
    ["a bad timestamp", () => put(alice, ID_1, profileBody({ updatedAt: "yesterday" })), "invalid_profile"],
    ["a far-future updatedAt", () => put(alice, ID_1, profileBody({ updatedAt: "2999-01-01T00:00:00.000Z" })), "invalid_timestamp"],
    ["a non-object body", () => put(alice, ID_1, "nope"), "invalid_profile"],
    ["a missing body", () => put(alice, ID_1, undefined), "invalid_profile"],
  ])("rejects %s", async (_label, run, code) => {
    const res = await run();
    expect(res.status).toBe(400);
    expect((await res.json()).error.code).toBe(code);
    expect(await list(alice)).toEqual([]);
  });

  it("trims the name", async () => {
    await put(alice, ID_1, profileBody({ name: "  Desk  " }));
    expect((await list(alice))[0].name).toBe("Desk");
  });

  it("ignores extra fields such as user_id or deletedAt in the body", async () => {
    await put(alice, ID_1, { ...profileBody(), user_id: bob.id, deletedAt: T1 });
    expect(await list(bob)).toEqual([]);
    expect((await list(alice))[0].deletedAt).toBeNull();
  });
});
