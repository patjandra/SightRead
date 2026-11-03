// @vitest-environment jsdom
import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { renderHook, waitFor, act, cleanup } from "@testing-library/react";
import { IDBFactory } from "fake-indexeddb";

const POINTS = { top: 0.1, center: 0.5, bottom: 0.9 };
const ALICE = { id: "alice-id", email: "alice@example.com" };
const BOB = { id: "bob-id", email: "bob@example.com" };
const T = (n) => `2026-11-01T10:0${n}:00.000Z`;

const remoteProfile = (id, over = {}) => ({
  id, name: id, points: POINTS, calibrationVersion: 5,
  createdAt: T(0), updatedAt: T(1), deletedAt: null, ...over,
});

let api, store, useLocalProfiles;

// The store and sync layers keep module-level state, so every test gets a fresh
// IndexedDB and freshly imported modules wired to a mocked network API.
async function setup() {
  globalThis.indexedDB = new IDBFactory();
  vi.resetModules();
  api = {
    fetchProfiles: vi.fn(async () => []),
    pushProfile: vi.fn(async (r) => ({
      id: r.id, name: r.name, points: r.points, calibrationVersion: r.calibrationVersion,
      createdAt: r.createdAt, updatedAt: r.updatedAt, deletedAt: null,
    })),
    deleteRemoteProfile: vi.fn(async (id) => remoteProfile(id, { deletedAt: T(9), updatedAt: T(9) })),
  };
  vi.doMock("../gaze/profileApi.js", () => api);
  store = await import("../gaze/profileStore.js");
  ({ useLocalProfiles } = await import("./useLocalProfiles.js"));
}

const guest = { authStatus: "guest" };
const signedIn = (user) => ({ authStatus: "signed-in", user });

function mount(initialProps) {
  return renderHook((props) => useLocalProfiles(props), { initialProps });
}

const settle = () => act(async () => { await new Promise((r) => setTimeout(r, 30)); });

beforeEach(setup);
afterEach(() => {
  cleanup();
  vi.doUnmock("../gaze/profileApi.js");
});

describe("as a guest", () => {
  it("keeps profiles local and never calls the API", async () => {
    const { result } = mount(guest);
    await waitFor(() => expect(result.current.ready).toBe(true));

    await act(() => result.current.addProfile("Desk", POINTS));
    expect(result.current.profiles[0]).toMatchObject({ name: "Desk", ownerId: null, syncState: "local" });
    await act(() => result.current.updateSelectedProfile({ top: 0.2, center: 0.5, bottom: 0.8 }));
    await settle();
    expect(api.fetchProfiles).not.toHaveBeenCalled();
    expect(api.pushProfile).not.toHaveBeenCalled();
  });

  it("does nothing special while the auth state is still loading", async () => {
    await store.createProfile("Old account profile", null, { ownerId: ALICE.id });
    const { result } = mount({ authStatus: "loading" });
    await waitFor(() => expect(result.current.ready).toBe(true));
    await settle();
    expect(result.current.profiles).toHaveLength(1); // not purged mid-load
  });
});

describe("signing in", () => {
  it("pulls the account's profiles from the server", async () => {
    api.fetchProfiles.mockResolvedValue([remoteProfile("from-cloud")]);
    const { result } = mount(signedIn(ALICE));
    await waitFor(() => expect(result.current.profiles.map((p) => p.name)).toContain("from-cloud"));
    expect(result.current.profiles.find((p) => p.name === "from-cloud")).toMatchObject({
      ownerId: ALICE.id,
      syncState: "synced",
    });
  });

  it("creates new profiles as account profiles and pushes them", async () => {
    const { result } = mount(signedIn(ALICE));
    await waitFor(() => expect(api.fetchProfiles).toHaveBeenCalled());
    await settle();

    await act(() => result.current.addProfile("Piano", POINTS));
    await waitFor(() => expect(api.pushProfile).toHaveBeenCalledTimes(1));
    await waitFor(() => expect(result.current.profiles[0].syncState).toBe("synced"));
    expect(result.current.profiles[0].ownerId).toBe(ALICE.id);
  });

  it("pushes edits to an account profile", async () => {
    const { result } = mount(signedIn(ALICE));
    await waitFor(() => expect(api.fetchProfiles).toHaveBeenCalled());
    await act(() => result.current.addProfile("Piano", null));
    await waitFor(() => expect(api.pushProfile).toHaveBeenCalledTimes(1));

    await act(() => result.current.updateSelectedProfile(POINTS));
    await waitFor(() => expect(api.pushProfile).toHaveBeenCalledTimes(2));
    expect(api.pushProfile.mock.calls[1][0].points).toEqual(POINTS);
  });

  it("sends deletes of account profiles and removes them", async () => {
    const { result } = mount(signedIn(ALICE));
    await waitFor(() => expect(api.fetchProfiles).toHaveBeenCalled());
    await act(() => result.current.addProfile("Piano", POINTS));
    const id = result.current.profiles[0].id;
    await waitFor(() => expect(result.current.profiles[0].syncState).toBe("synced"));

    await act(() => result.current.removeProfile(id));
    await waitFor(() => expect(api.deleteRemoteProfile).toHaveBeenCalledWith(id));
    expect(await store.getAllRecords()).toEqual([]);
  });

  it("leaves a failed push pending and reports an error", async () => {
    api.pushProfile.mockRejectedValue(new TypeError("Failed to fetch"));
    const { result } = mount(signedIn(ALICE));
    await waitFor(() => expect(api.fetchProfiles).toHaveBeenCalled());
    await act(() => result.current.addProfile("Piano", POINTS));
    await waitFor(() => expect(result.current.syncStatus).toBe("error"));
    expect(result.current.profiles[0].syncState).toBe("pending");
  });

  it("calls onUnauthorized when the API reports the session is gone", async () => {
    api.fetchProfiles.mockRejectedValue(Object.assign(new Error("x"), { status: 401 }));
    const onUnauthorized = vi.fn();
    mount({ ...signedIn(ALICE), onUnauthorized });
    await waitFor(() => expect(onUnauthorized).toHaveBeenCalled());
  });
});

describe("signing out", () => {
  it("removes account profiles from the device but keeps guest ones", async () => {
    await store.createProfile("Guest one", null);
    await store.createProfile("Alice's", POINTS, { ownerId: ALICE.id });
    await store.markUploadOffered(ALICE.id);
    api.fetchProfiles.mockResolvedValue([remoteProfile("x")]);

    const { result, rerender } = mount(signedIn(ALICE));
    await waitFor(() => expect(result.current.profiles.some((p) => p.name === "Alice's")).toBe(true));

    rerender(guest);
    await waitFor(() => expect(result.current.profiles.map((p) => p.name)).toEqual(["Guest one"]));
    expect((await store.getAllRecords()).every((r) => !r.ownerId)).toBe(true);
  });

  it("repairs the selection if the selected profile was an account one", async () => {
    const g = await store.createProfile("Guest one", null);
    const mine = await store.createProfile("Alice's", POINTS, { ownerId: ALICE.id });
    await store.setSelectedProfileId(mine.id);

    const { result } = mount(guest);
    await waitFor(() => expect(result.current.selectedId).toBe(g.id));
  });

  it("does NOT purge when the session check merely failed (offline)", async () => {
    await store.createProfile("Unsynced edit", POINTS, { ownerId: ALICE.id });
    const { result } = mount({ authStatus: "guest", sessionUnknown: true });
    await waitFor(() => expect(result.current.ready).toBe(true));
    await settle();
    expect(result.current.profiles.map((p) => p.name)).toEqual(["Unsynced edit"]);
  });

  it("purges a different account's leftovers when someone else signs in", async () => {
    await store.createProfile("Alice's", POINTS, { ownerId: ALICE.id });
    await store.markUploadOffered(BOB.id);
    const { result } = mount(signedIn(BOB));
    await waitFor(() => expect(api.fetchProfiles).toHaveBeenCalled());
    await waitFor(() => expect(result.current.profiles).toEqual([]));
  });
});

describe("saving a guest profile to the account", () => {
  it("claims and uploads it using the user passed in (not the stale hook state)", async () => {
    const { result } = mount(guest); // the hook still thinks nobody is signed in
    await waitFor(() => expect(result.current.ready).toBe(true));
    const profile = await act(() => result.current.addProfile("Desk", POINTS));

    await act(() => result.current.saveToAccount(profile.id, ALICE));
    expect(api.pushProfile).toHaveBeenCalledWith(expect.objectContaining({ id: profile.id }));
    await waitFor(() =>
      expect(result.current.profiles[0]).toMatchObject({ ownerId: ALICE.id, syncState: "synced" })
    );
  });

  it("returns 'missing' for a profile that no longer exists", async () => {
    const { result } = mount(guest);
    await waitFor(() => expect(result.current.ready).toBe(true));
    let outcome;
    await act(async () => {
      outcome = await result.current.saveToAccount("gone", ALICE);
    });
    expect(outcome).toBe("missing");
  });
});

describe("one-time upload offer", () => {
  it("offers remaining guest profiles after the first sign-in, once per account", async () => {
    await store.createProfile("Guest A", null);
    await new Promise((r) => setTimeout(r, 5)); // profiles list oldest-first by createdAt
    await store.createProfile("Guest B", POINTS);

    const first = mount(signedIn(ALICE));
    await waitFor(() => expect(first.result.current.uploadOffer?.map((p) => p.name)).toEqual(["Guest A", "Guest B"]));
    expect(await store.hasOfferedUpload(ALICE.id)).toBe(true);
    first.unmount();

    // Signing in again on this device does not ask again.
    const again = mount(signedIn(ALICE));
    await waitFor(() => expect(api.fetchProfiles).toHaveBeenCalledTimes(2));
    await settle();
    expect(again.result.current.uploadOffer).toBeNull();
  });

  it("leaves out a profile that was just saved through the sign-in gate", async () => {
    const a = await store.createProfile("Gate me", POINTS);
    await store.createProfile("Other", null);

    const { result, rerender } = mount(guest);
    await waitFor(() => expect(result.current.ready).toBe(true));
    // The gate calls saveToAccount in the same tick that auth flips to signed-in.
    act(() => {
      result.current.saveToAccount(a.id, ALICE);
      rerender(signedIn(ALICE));
    });
    await waitFor(() => expect(result.current.uploadOffer?.map((p) => p.name)).toEqual(["Other"]));
  });

  it("makes no offer when there is nothing local", async () => {
    const { result } = mount(signedIn(ALICE));
    await waitFor(() => expect(api.fetchProfiles).toHaveBeenCalled());
    await settle();
    expect(result.current.uploadOffer).toBeNull();
  });

  it("uploads only the chosen profiles on confirm", async () => {
    const a = await store.createProfile("Guest A", null);
    await store.createProfile("Guest B", null);
    const { result } = mount(signedIn(ALICE));
    await waitFor(() => expect(result.current.uploadOffer).toHaveLength(2));

    await act(() => result.current.confirmUploadOffer([a.id], ALICE));
    expect(api.pushProfile).toHaveBeenCalledTimes(1);
    expect(result.current.uploadOffer).toBeNull();
    const records = await store.getAllRecords();
    expect(records.find((r) => r.name === "Guest B").ownerId).toBeNull();
  });

  it("dismissing keeps everything local", async () => {
    await store.createProfile("Guest A", null);
    const { result } = mount(signedIn(ALICE));
    await waitFor(() => expect(result.current.uploadOffer).toHaveLength(1));
    act(() => result.current.dismissUploadOffer());
    expect(result.current.uploadOffer).toBeNull();
    expect(api.pushProfile).not.toHaveBeenCalled();
  });
});

describe("syncing on focus", () => {
  it("re-syncs on focus only after the throttle window", async () => {
    mount(signedIn(ALICE));
    await waitFor(() => expect(api.fetchProfiles).toHaveBeenCalledTimes(1));
    await settle();

    act(() => void window.dispatchEvent(new Event("focus")));
    await settle();
    expect(api.fetchProfiles).toHaveBeenCalledTimes(1); // too soon

    const real = Date.now();
    const spy = vi.spyOn(Date, "now").mockReturnValue(real + 60_000);
    act(() => void window.dispatchEvent(new Event("focus")));
    await waitFor(() => expect(api.fetchProfiles).toHaveBeenCalledTimes(2));
    spy.mockRestore();
  });
});

describe("reconnecting", () => {
  it("counts pending changes and pushes them as soon as the network returns", async () => {
    api.pushProfile.mockRejectedValue(new TypeError("Failed to fetch"));
    const { result } = mount(signedIn(ALICE));
    await waitFor(() => expect(api.fetchProfiles).toHaveBeenCalled());
    await act(() => result.current.addProfile("Piano", POINTS));
    await waitFor(() => expect(result.current.pendingCount).toBe(1));

    act(() => void window.dispatchEvent(new Event("offline")));
    api.pushProfile.mockImplementation(async (r) => ({ ...remoteProfile(r.id), updatedAt: r.updatedAt }));
    act(() => void window.dispatchEvent(new Event("online")));

    await waitFor(() => expect(result.current.pendingCount).toBe(0));
    expect(result.current.profiles[0].syncState).toBe("synced");
    expect(result.current.syncStatus).toBe("idle");
  });

  it("does not count guest profiles as waiting", async () => {
    const { result } = mount(guest);
    await waitFor(() => expect(result.current.ready).toBe(true));
    await act(() => result.current.addProfile("Local", POINTS));
    expect(result.current.pendingCount).toBe(0);
  });
});
