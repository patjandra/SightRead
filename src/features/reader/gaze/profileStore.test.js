import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";
import { IDBFactory } from "fake-indexeddb";

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/;
const POINTS = { top: 0.1, center: 0.5, bottom: 0.9 };

let store;

// The store caches its DB handle and migration promise at module level, so each
// test gets a fresh IndexedDB and a freshly imported module.
async function freshStore() {
  globalThis.indexedDB = new IDBFactory();
  vi.resetModules();
  return import("./profileStore.js");
}

/** Write records straight into the DB, the way an older app version left them. */
function seedLegacyDb(records, selected) {
  return new Promise((resolve, reject) => {
    const req = indexedDB.open("sightread", 1);
    req.onupgradeneeded = () => {
      req.result.createObjectStore("profiles", { keyPath: "id" });
      req.result.createObjectStore("meta", { keyPath: "key" });
    };
    req.onerror = () => reject(req.error);
    req.onsuccess = () => {
      const db = req.result;
      const tx = db.transaction(["profiles", "meta"], "readwrite");
      for (const r of records) tx.objectStore("profiles").put(r);
      // Pre-existing app state: the localStorage migration already ran.
      tx.objectStore("meta").put({ key: "migratedFromLocalStorage", value: true });
      if (selected) tx.objectStore("meta").put({ key: "selectedProfileId", value: selected });
      tx.oncomplete = () => {
        db.close();
        resolve();
      };
      tx.onerror = () => reject(tx.error);
    };
  });
}

beforeEach(async () => {
  store = await freshStore();
});
afterEach(() => {
  vi.unstubAllGlobals();
});

describe("createProfile", () => {
  it("creates a guest-local profile with a UUID and sync fields", async () => {
    const p = await store.createProfile("  Desk ", POINTS);
    expect(p).toMatchObject({
      name: "Desk",
      points: POINTS,
      ownerId: null,
      syncState: "local",
      deletedAt: null,
    });
    expect(p.id).toMatch(UUID);
    expect(p.updatedAt).toBe(p.createdAt);
    expect(p.calibrationVersion).toBeTypeOf("number");
  });

  it("creates an account profile as pending", async () => {
    const p = await store.createProfile("Desk", null, { ownerId: "user-1" });
    expect(p).toMatchObject({ ownerId: "user-1", syncState: "pending", calibrationVersion: null });
  });

  it("lists profiles oldest first", async () => {
    const a = await store.createProfile("A", null);
    await new Promise((r) => setTimeout(r, 5));
    const b = await store.createProfile("B", null);
    expect((await store.getAllProfiles()).map((p) => p.id)).toEqual([a.id, b.id]);
  });
});

describe("updateProfile", () => {
  it("bumps updatedAt and keeps guest profiles local", async () => {
    const p = await store.createProfile("Desk", null);
    await new Promise((r) => setTimeout(r, 5));
    const u = await store.updateProfile(p.id, POINTS);
    expect(u.updatedAt > p.updatedAt).toBe(true);
    expect(u).toMatchObject({ points: POINTS, syncState: "local" });
  });

  it("marks account profiles pending", async () => {
    const p = await store.createProfile("Desk", null, { ownerId: "user-1" });
    await store.putRecord({ ...p, syncState: "synced" });
    expect((await store.updateProfile(p.id, POINTS)).syncState).toBe("pending");
  });

  it("returns undefined for an unknown id", async () => {
    expect(await store.updateProfile("nope", POINTS)).toBeUndefined();
  });
});

describe("renameProfile", () => {
  it("trims, bumps updatedAt and keeps a guest profile local", async () => {
    const p = await store.createProfile("Desk", POINTS);
    await new Promise((r) => setTimeout(r, 5));
    const r = await store.renameProfile(p.id, "  Piano ");
    expect(r).toMatchObject({ name: "Piano", points: POINTS, syncState: "local" });
    expect(r.updatedAt > p.updatedAt).toBe(true);
  });

  it("marks an account profile pending", async () => {
    const p = await store.createProfile("Desk", POINTS, { ownerId: "user-1" });
    await store.putRecord({ ...p, syncState: "synced" });
    expect((await store.renameProfile(p.id, "Piano")).syncState).toBe("pending");
  });

  it("ignores empty names and unknown ids", async () => {
    const p = await store.createProfile("Desk", null);
    expect((await store.renameProfile(p.id, "  ")).name).toBe("Desk");
    expect(await store.renameProfile("nope", "X")).toBeUndefined();
  });
});

describe("deleteProfile", () => {
  it("removes a guest-local profile outright", async () => {
    const p = await store.createProfile("Desk", null);
    await store.deleteProfile(p.id);
    expect(await store.getAllRecords()).toEqual([]);
  });

  it("leaves a hidden, pending tombstone for an account profile", async () => {
    const p = await store.createProfile("Desk", POINTS, { ownerId: "user-1" });
    await store.deleteProfile(p.id);
    expect(await store.getAllProfiles()).toEqual([]);
    expect(await store.getProfile(p.id)).toBeUndefined();
    const [tomb] = await store.getAllRecords();
    expect(tomb).toMatchObject({ id: p.id, syncState: "pending" });
    expect(tomb.deletedAt).toBeTruthy();
  });

  it("falls back to another profile when the selected one is deleted", async () => {
    const a = await store.createProfile("A", null);
    await new Promise((r) => setTimeout(r, 5));
    const b = await store.createProfile("B", null);
    await store.setSelectedProfileId(b.id);
    await store.deleteProfile(b.id);
    expect(await store.getSelectedProfileId()).toBe(a.id);
    await store.deleteProfile(a.id);
    expect(await store.getSelectedProfileId()).toBeNull();
  });

  it("leaves 'nothing selected' alone when another profile is deleted", async () => {
    const a = await store.createProfile("A", null);
    await store.createProfile("B", null);
    await store.deleteProfile(a.id);
    expect(await store.getSelectedProfileId()).toBeNull();
  });
});

describe("claimProfile", () => {
  it("assigns a guest profile to an account and marks it pending", async () => {
    const p = await store.createProfile("Desk", POINTS);
    const claimed = await store.claimProfile(p.id, "user-1");
    expect(claimed).toMatchObject({ ownerId: "user-1", syncState: "pending", updatedAt: p.updatedAt });
  });

  it("does not steal a profile that already belongs to someone", async () => {
    const p = await store.createProfile("Desk", POINTS, { ownerId: "user-1" });
    const result = await store.claimProfile(p.id, "user-2");
    expect(result.ownerId).toBe("user-1");
    expect((await store.getAllRecords())[0].ownerId).toBe("user-1");
  });
});

describe("purgeAccountRecords", () => {
  it("removes all account profiles but keeps guest-local ones", async () => {
    const guest = await store.createProfile("Guest", null);
    await store.createProfile("Mine", null, { ownerId: "user-1" });
    await store.createProfile("Theirs", null, { ownerId: "user-2" });

    expect(await store.purgeAccountRecords(null)).toBe(2);
    expect((await store.getAllRecords()).map((r) => r.id)).toEqual([guest.id]);
  });

  it("keeps the given account's profiles and removes other accounts'", async () => {
    await store.createProfile("Mine", null, { ownerId: "user-1" });
    await store.createProfile("Theirs", null, { ownerId: "user-2" });
    expect(await store.purgeAccountRecords("user-1")).toBe(1);
    expect((await store.getAllRecords()).map((r) => r.name)).toEqual(["Mine"]);
  });

  it("also removes tombstones and repairs the selected pointer", async () => {
    const guest = await store.createProfile("Guest", null);
    await new Promise((r) => setTimeout(r, 5));
    const mine = await store.createProfile("Mine", null, { ownerId: "user-1" });
    await store.setSelectedProfileId(mine.id);
    await store.purgeAccountRecords(null);
    expect(await store.getSelectedProfileId()).toBe(guest.id);
  });
});

describe("upload-offer flag", () => {
  it("is remembered per user", async () => {
    expect(await store.hasOfferedUpload("user-1")).toBe(false);
    await store.markUploadOffered("user-1");
    expect(await store.hasOfferedUpload("user-1")).toBe(true);
    expect(await store.hasOfferedUpload("user-2")).toBe(false);
  });
});

describe("migrations", () => {
  it("gives legacy Date.now() ids a UUID, fills sync fields, and remaps the selection", async () => {
    await seedLegacyDb(
      [
        { id: "1700000000000", name: "Old A", createdAt: "2026-01-01T00:00:00.000Z", points: POINTS, calibrationVersion: 5 },
        { id: "1700000000001", name: "Old B", createdAt: "2026-01-02T00:00:00.000Z", points: null, calibrationVersion: null },
      ],
      "1700000000001"
    );
    vi.resetModules();
    store = await import("./profileStore.js");

    const profiles = await store.getAllProfiles();
    expect(profiles.map((p) => p.name)).toEqual(["Old A", "Old B"]);
    for (const p of profiles) {
      expect(p.id).toMatch(UUID);
      expect(p).toMatchObject({ ownerId: null, syncState: "local", deletedAt: null });
      expect(p.updatedAt).toBe(p.createdAt);
    }
    expect(profiles[0].points).toEqual(POINTS);
    expect(await store.getSelectedProfileId()).toBe(profiles[1].id);
  });

  it("runs only once: ids stay stable across loads", async () => {
    await seedLegacyDb([{ id: "1700000000000", name: "Old", createdAt: "2026-01-01T00:00:00.000Z", points: null }]);
    vi.resetModules();
    store = await import("./profileStore.js");
    const [first] = await store.getAllProfiles();

    vi.resetModules();
    store = await import("./profileStore.js");
    const [second] = await store.getAllProfiles();
    expect(second.id).toBe(first.id);
  });

  it("still imports profiles from the old localStorage layout, then gives them UUIDs", async () => {
    vi.stubGlobal("localStorage", {
      getItem: (k) =>
        k === "sightread_profiles"
          ? JSON.stringify([{ id: "42", name: "From LS", createdAt: "2026-01-01T00:00:00.000Z", points: POINTS, calibrationVersion: 5 }])
          : k === "sightread_selected_profile"
          ? "42"
          : null,
    });
    const [p] = await store.getAllProfiles();
    expect(p).toMatchObject({ name: "From LS", points: POINTS });
    expect(p.id).toMatch(UUID);
    expect(await store.getSelectedProfileId()).toBe(p.id);
  });
});
