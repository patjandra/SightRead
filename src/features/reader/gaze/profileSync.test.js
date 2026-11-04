import { describe, it, expect, vi } from "vitest";
import { planSync, pushRecord, syncProfiles, createSerializer, fromRemote } from "./profileSync.js";

const ME = "user-1";
const T = (n) => `2026-11-01T10:0${n}:00.000Z`;
const POINTS = { top: 0.1, center: 0.5, bottom: 0.9 };

const local = (id, over = {}) => ({
  id, name: id, points: POINTS, calibrationVersion: 5,
  createdAt: T(0), updatedAt: T(1), ownerId: ME, syncState: "synced", deletedAt: null, ...over,
});
const remote = (id, over = {}) => ({
  id, name: id, points: POINTS, calibrationVersion: 5,
  createdAt: T(0), updatedAt: T(1), deletedAt: null, ...over,
});

describe("planSync", () => {
  const plan = (l, r, owner = ME) => planSync(l, r, owner);
  const empty = { adopt: [], removeLocal: [], push: [], sendDelete: [] };

  it("does nothing when both sides agree", () => {
    expect(plan([local("a")], [remote("a")])).toEqual(empty);
  });

  it("adopts a profile that only exists on the server", () => {
    const p = plan([], [remote("a", { name: "From cloud" })]);
    expect(p.adopt).toEqual([fromRemote(remote("a", { name: "From cloud" }), ME)]);
    expect(p.adopt[0]).toMatchObject({ ownerId: ME, syncState: "synced" });
  });

  it("ignores a server tombstone for a profile this device never had", () => {
    expect(plan([], [remote("a", { deletedAt: T(2) })])).toEqual(empty);
  });

  it("pushes a pending local-only profile", () => {
    const l = local("a", { syncState: "pending" });
    expect(plan([l], []).push).toEqual([l]);
  });

  it("re-pushes a synced local profile the server has lost", () => {
    expect(plan([local("a")], []).push).toHaveLength(1);
  });

  it("drops a local tombstone the server never knew about", () => {
    expect(plan([local("a", { deletedAt: T(2), syncState: "pending" })], []).removeLocal).toEqual(["a"]);
  });

  it("takes the server copy when it is newer", () => {
    const p = plan([local("a", { name: "old" })], [remote("a", { name: "new", updatedAt: T(3) })]);
    expect(p.adopt[0]).toMatchObject({ name: "new", updatedAt: T(3), syncState: "synced" });
    expect(p.push).toEqual([]);
  });

  it("pushes the local copy when it is newer", () => {
    const l = local("a", { name: "mine", updatedAt: T(3), syncState: "pending" });
    const p = plan([l], [remote("a", { updatedAt: T(1) })]);
    expect(p.push).toEqual([l]);
    expect(p.adopt).toEqual([]);
  });

  it("marks an identical pending edit as synced", () => {
    const p = plan([local("a", { syncState: "pending" })], [remote("a")]);
    expect(p.adopt[0].syncState).toBe("synced");
  });

  it("removes locally when the server says it was deleted, even if edited here later", () => {
    const p = plan([local("a", { updatedAt: T(9), syncState: "pending" })], [remote("a", { deletedAt: T(2), updatedAt: T(2) })]);
    expect(p.removeLocal).toEqual(["a"]);
    expect(p.push).toEqual([]);
  });

  it("sends a local delete to the server", () => {
    const p = plan([local("a", { deletedAt: T(2), syncState: "pending" })], [remote("a")]);
    expect(p.sendDelete).toEqual(["a"]);
  });

  it("leaves guest-local and other accounts' records alone", () => {
    const guest = local("g", { ownerId: null, syncState: "local" });
    const other = local("o", { ownerId: "user-2" });
    expect(plan([guest, other], [])).toEqual(empty);
  });
});

function fakeStore(records = []) {
  const map = new Map(records.map((r) => [r.id, r]));
  return {
    map,
    getAllRecords: vi.fn(async () => [...map.values()]),
    getRecord: vi.fn(async (id) => map.get(id)),
    putRecord: vi.fn(async (r) => void map.set(r.id, r)),
    removeRecord: vi.fn(async (id) => void map.delete(id)),
  };
}

describe("pushRecord", () => {
  it("stores the server's answer and marks the record synced", async () => {
    const rec = local("a", { syncState: "pending" });
    const store = fakeStore([rec]);
    const api = { pushProfile: vi.fn(async () => remote("a")) };
    expect(await pushRecord({ api, store, ownerId: ME, record: rec })).toBe("synced");
    expect(store.map.get("a").syncState).toBe("synced");
  });

  it("adopts a newer record the server already had", async () => {
    const rec = local("a", { syncState: "pending" });
    const store = fakeStore([rec]);
    const api = { pushProfile: async () => remote("a", { name: "theirs", updatedAt: T(5) }) };
    await pushRecord({ api, store, ownerId: ME, record: rec });
    expect(store.map.get("a")).toMatchObject({ name: "theirs", updatedAt: T(5), syncState: "synced" });
  });

  it("removes the record when the server says it was deleted", async () => {
    const rec = local("a", { syncState: "pending" });
    const store = fakeStore([rec]);
    const api = { pushProfile: async () => remote("a", { deletedAt: T(5) }) };
    expect(await pushRecord({ api, store, ownerId: ME, record: rec })).toBe("removed");
    expect(store.map.has("a")).toBe(false);
  });

  it("does not overwrite an edit made while the request was in flight", async () => {
    const rec = local("a", { syncState: "pending" });
    const store = fakeStore([rec]);
    const api = {
      pushProfile: async () => {
        store.map.set("a", { ...rec, name: "edited meanwhile", updatedAt: T(8) });
        return remote("a");
      },
    };
    expect(await pushRecord({ api, store, ownerId: ME, record: rec })).toBe("pending");
    // The newer local edit survives and stays queued for the next push.
    expect(store.map.get("a")).toMatchObject({ name: "edited meanwhile", updatedAt: T(8), syncState: "pending" });
  });

  it("sends deletes and then removes the tombstone", async () => {
    const rec = local("a", { deletedAt: T(2), syncState: "pending" });
    const store = fakeStore([rec]);
    const api = { deleteRemoteProfile: vi.fn(async () => remote("a", { deletedAt: T(2) })) };
    expect(await pushRecord({ api, store, ownerId: ME, record: rec })).toBe("removed");
    expect(api.deleteRemoteProfile).toHaveBeenCalledWith("a");
    expect(store.map.has("a")).toBe(false);
  });

  it("treats a 404 on delete as already gone", async () => {
    const rec = local("a", { deletedAt: T(2), syncState: "pending" });
    const store = fakeStore([rec]);
    const api = { deleteRemoteProfile: async () => Promise.reject(Object.assign(new Error("x"), { status: 404 })) };
    expect(await pushRecord({ api, store, ownerId: ME, record: rec })).toBe("removed");
  });

  it("keeps the record pending on a network or server error", async () => {
    const rec = local("a", { syncState: "pending" });
    const store = fakeStore([rec]);
    const api = { pushProfile: async () => Promise.reject(new TypeError("Failed to fetch")) };
    expect(await pushRecord({ api, store, ownerId: ME, record: rec })).toBe("pending");
    expect(store.map.get("a").syncState).toBe("pending");
  });

  it("propagates a 401 so the caller can re-check the session", async () => {
    const rec = local("a", { syncState: "pending" });
    const api = { pushProfile: async () => Promise.reject(Object.assign(new Error("x"), { status: 401 })) };
    await expect(pushRecord({ api, store: fakeStore([rec]), ownerId: ME, record: rec })).rejects.toMatchObject({ status: 401 });
  });
});

describe("syncProfiles", () => {
  it("pulls new profiles, pushes pending ones, and applies deletes", async () => {
    const store = fakeStore([
      local("pending", { syncState: "pending", updatedAt: T(4) }),
      local("deleted-here", { deletedAt: T(3), syncState: "pending" }),
      local("deleted-there"),
      local("guest", { ownerId: null, syncState: "local" }),
    ]);
    const api = {
      fetchProfiles: async () => [
        remote("new-from-cloud"),
        remote("deleted-here"),
        remote("deleted-there", { deletedAt: T(5) }),
      ],
      pushProfile: vi.fn(async (r) => ({ ...remote(r.id), updatedAt: r.updatedAt })),
      deleteRemoteProfile: vi.fn(async (id) => remote(id, { deletedAt: T(6) })),
    };

    const result = await syncProfiles({ api, store, ownerId: ME });

    expect(result).toEqual({ pushed: 2, failed: 0 });
    expect(store.map.get("new-from-cloud")).toMatchObject({ ownerId: ME, syncState: "synced" });
    expect(store.map.get("pending").syncState).toBe("synced");
    expect(api.deleteRemoteProfile).toHaveBeenCalledWith("deleted-here");
    expect(store.map.has("deleted-here")).toBe(false);
    expect(store.map.has("deleted-there")).toBe(false);
    expect(store.map.get("guest").ownerId).toBeNull(); // untouched
    expect(api.pushProfile).not.toHaveBeenCalledWith(expect.objectContaining({ id: "guest" }));
  });

  it("counts records that failed to push and leaves them pending", async () => {
    const store = fakeStore([local("a", { syncState: "pending" })]);
    const api = { fetchProfiles: async () => [], pushProfile: async () => Promise.reject(new Error("boom")) };
    expect(await syncProfiles({ api, store, ownerId: ME })).toEqual({ pushed: 0, failed: 1 });
    expect(store.map.get("a").syncState).toBe("pending");
  });

  it("throws when the pull itself fails", async () => {
    const api = { fetchProfiles: async () => Promise.reject(new Error("offline")) };
    await expect(syncProfiles({ api, store: fakeStore(), ownerId: ME })).rejects.toThrow("offline");
  });
});

describe("createSerializer", () => {
  it("runs tasks one at a time, in order, even after a failure", async () => {
    const run = createSerializer();
    const log = [];
    const task = (name, ms, fail) => () =>
      new Promise((resolve, reject) =>
        setTimeout(() => {
          log.push(name);
          fail ? reject(new Error(name)) : resolve(name);
        }, ms)
      );
    const results = await Promise.allSettled([run(task("slow", 20)), run(task("fails", 1, true)), run(task("last", 1))]);
    expect(log).toEqual(["slow", "fails", "last"]);
    expect(results.map((r) => r.status)).toEqual(["fulfilled", "rejected", "fulfilled"]);
  });
});

describe("syncProfiles racing with local edits", () => {
  it("does not overwrite an edit made after the snapshot was taken", async () => {
    const records = new Map([["a", local("a", { name: "old", updatedAt: T(1) })]]);
    const store = {
      // Snapshot is taken here; the user then edits before sync applies its plan.
      getAllRecords: vi.fn(async () => {
        const snapshot = [...records.values()].map((r) => ({ ...r }));
        records.set("a", local("a", { name: "mine", updatedAt: T(5), syncState: "pending" }));
        return snapshot;
      }),
      getRecord: vi.fn(async (id) => records.get(id)),
      putRecord: vi.fn(async (r) => void records.set(r.id, r)),
      removeRecord: vi.fn(async (id) => void records.delete(id)),
    };
    const api = {
      fetchProfiles: vi.fn(async () => [remote("a", { name: "cloud", updatedAt: T(3) })]),
      pushProfile: vi.fn(async (r) => remote(r.id, { name: r.name, updatedAt: r.updatedAt })),
      deleteRemoteProfile: vi.fn(),
    };

    await syncProfiles({ api, store, ownerId: ME });

    expect(records.get("a").name).toBe("mine");
  });
});
