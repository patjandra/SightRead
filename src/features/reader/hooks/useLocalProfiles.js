import { useState, useEffect, useCallback, useRef } from "react";
import * as store from "../gaze/profileStore.js";
import * as api from "../gaze/profileApi.js";
import { pushRecord, syncProfiles, createSerializer } from "../gaze/profileSync.js";

// Re-sync when the tab regains focus, but not more often than this.
const FOCUS_SYNC_MIN_INTERVAL_MS = 30_000;

/**
 * React binding over the local profile store, plus account sync.
 *
 * Guests: profiles live in IndexedDB only, exactly as before.
 * Signed in: the account's profiles are pulled on sign-in, on load and on tab
 * focus, and every local change is pushed straight away. Profiles carry a
 * `syncState` ("local" | "pending" | "synced") for the UI.
 *
 * Auth input (all optional, so the hook still works with no account):
 *   user            - the signed-in user, or null
 *   authStatus      - "loading" | "guest" | "signed-in"
 *   sessionUnknown  - the session check failed (offline). NOT a sign-out: local
 *                     account data is kept so unsynced edits aren't lost.
 *   onUnauthorized  - called when the API says the session is gone
 *
 * Everything that touches the store/network is serialized so overlapping
 * syncs, pushes and purges can't interleave.
 */
export function useLocalProfiles({
  user = null,
  authStatus = "loading",
  sessionUnknown = false,
  onUnauthorized,
} = {}) {
  const [profiles, setProfiles] = useState([]);
  const [selectedId, setSelectedId] = useState(null);
  const [ready, setReady] = useState(false);
  const [syncStatus, setSyncStatus] = useState("idle"); // "idle" | "syncing" | "error"
  // Guest-local profiles offered for upload right after a first sign-in.
  const [uploadOffer, setUploadOffer] = useState(null);

  const userId = user?.id ?? null;
  const signedIn = authStatus === "signed-in" && !!userId;

  const runRef = useRef(null);
  if (!runRef.current) runRef.current = createSerializer();
  const run = runRef.current;

  // Latest values for callbacks that must not go stale.
  const accountRef = useRef(null);
  accountRef.current = signedIn ? userId : null;
  const onUnauthorizedRef = useRef(onUnauthorized);
  onUnauthorizedRef.current = onUnauthorized;
  const lastSyncRef = useRef(0);
  // Profiles the user explicitly saved this session, kept out of the upload offer.
  const justSavedRef = useRef(new Set());
  const aliveRef = useRef(true);
  useEffect(() => {
    aliveRef.current = true;
    return () => {
      aliveRef.current = false;
    };
  }, []);

  const reload = useCallback(async () => {
    const [list, sel] = await Promise.all([
      store.getAllProfiles(),
      store.getSelectedProfileId(),
    ]);
    if (!aliveRef.current) return;
    setProfiles(list);
    setSelectedId(sel);
  }, []);

  // Hydrate from IndexedDB once on mount.
  useEffect(() => {
    (async () => {
      await reload();
      if (aliveRef.current) setReady(true);
    })().catch((err) => {
      // A storage failure shouldn't crash the app; log and continue empty.
      console.error("[SightRead] Failed to load profiles:", err);
      if (aliveRef.current) setReady(true);
    });
  }, [reload]);

  const reportFailure = useCallback((err) => {
    if (err?.status === 401) onUnauthorizedRef.current?.();
    if (aliveRef.current) setSyncStatus("error");
  }, []);

  // Push one record and reconcile. NOT serialized: call inside `run`.
  const push = useCallback(
    async (record, ownerId) => {
      if (aliveRef.current) setSyncStatus("syncing");
      try {
        const outcome = await pushRecord({ api, store, ownerId, record });
        if (aliveRef.current) setSyncStatus(outcome === "pending" ? "error" : "idle");
        return outcome;
      } catch (err) {
        reportFailure(err);
        return "pending";
      }
    },
    [reportFailure]
  );

  const pushSoon = useCallback(
    (record, ownerId) =>
      run(async () => {
        const outcome = await push(record, ownerId);
        await reload();
        return outcome;
      }),
    [run, push, reload]
  );

  const sync = useCallback(
    (ownerId) =>
      run(async () => {
        if (aliveRef.current) setSyncStatus("syncing");
        try {
          await store.purgeAccountRecords(ownerId); // drop other accounts' leftovers
          const { failed } = await syncProfiles({ api, store, ownerId });
          lastSyncRef.current = Date.now();
          if (aliveRef.current) setSyncStatus(failed ? "error" : "idle");
        } catch (err) {
          reportFailure(err);
        }
        await reload();
      }),
    [run, reload, reportFailure]
  );

  // React to who is signed in.
  useEffect(() => {
    if (!ready) return;

    if (signedIn) {
      (async () => {
        await sync(userId);
        // One-time offer to upload what was created as a guest on this device.
        if (await store.hasOfferedUpload(userId)) return;
        const guests = (await store.getAllProfiles()).filter(
          (p) => !p.ownerId && !justSavedRef.current.has(p.id)
        );
        if (guests.length === 0 || !aliveRef.current) return;
        await store.markUploadOffered(userId);
        setUploadOffer(guests);
      })().catch((err) => console.error("[SightRead] Profile sync failed:", err));
    } else if (authStatus === "guest" && !sessionUnknown) {
      // Confirmed signed out: account profiles must not stay visible on this
      // device. (An unreachable API is not a sign-out, so it never gets here.)
      setUploadOffer(null);
      run(async () => {
        await store.purgeAccountRecords(null);
        if (aliveRef.current) setSyncStatus("idle");
        await reload();
      }).catch((err) => console.error("[SightRead] Profile cleanup failed:", err));
    }
  }, [ready, signedIn, userId, authStatus, sessionUnknown, sync, run, reload]);

  // Pick up changes made on other devices when the tab is used again.
  useEffect(() => {
    if (!signedIn) return;
    const onWake = () => {
      if (document.visibilityState === "hidden") return;
      if (Date.now() - lastSyncRef.current < FOCUS_SYNC_MIN_INTERVAL_MS) return;
      sync(userId);
    };
    window.addEventListener("focus", onWake);
    document.addEventListener("visibilitychange", onWake);
    return () => {
      window.removeEventListener("focus", onWake);
      document.removeEventListener("visibilitychange", onWake);
    };
  }, [signedIn, userId, sync]);

  const selectedProfile = profiles.find((p) => p.id === selectedId) || null;

  const selectProfile = useCallback((id) => {
    setSelectedId(id);
    store.setSelectedProfileId(id);
  }, []);

  const addProfile = useCallback(
    async (name, points) => {
      const ownerId = accountRef.current;
      const profile = await store.createProfile(name, points, { ownerId });
      await reload();
      setSelectedId(profile.id);
      await store.setSelectedProfileId(profile.id);
      if (ownerId) pushSoon(profile, ownerId);
      return profile;
    },
    [reload, pushSoon]
  );

  const updateSelectedProfile = useCallback(
    async (points) => {
      if (!selectedId) return null;
      const profile = await store.updateProfile(selectedId, points);
      await reload();
      if (profile?.ownerId) pushSoon(profile, profile.ownerId);
      return profile;
    },
    [selectedId, reload, pushSoon]
  );

  const removeProfile = useCallback(
    async (id) => {
      const before = await store.getRecord(id);
      await store.deleteProfile(id);
      await reload();
      if (before?.ownerId) {
        const tombstone = await store.getRecord(id);
        if (tombstone) pushSoon(tombstone, tombstone.ownerId);
      }
    },
    [reload, pushSoon]
  );

  /**
   * Make a (guest-local) profile belong to the account and upload it.
   * `accountUser` is passed in because, when this runs as the continuation of
   * the sign-in prompt, this hook's own `user` is still the pre-sign-in one.
   */
  const saveToAccount = useCallback(
    (id, accountUser) => {
      justSavedRef.current.add(id);
      return run(async () => {
        const claimed = await store.claimProfile(id, accountUser.id);
        if (!claimed) return "missing";
        const outcome = await push(claimed, accountUser.id);
        await reload();
        return outcome;
      });
    },
    [run, push, reload]
  );

  const confirmUploadOffer = useCallback(
    async (ids, accountUser) => {
      setUploadOffer(null);
      for (const id of ids) await saveToAccount(id, accountUser);
    },
    [saveToAccount]
  );

  const dismissUploadOffer = useCallback(() => setUploadOffer(null), []);

  const retrySync = useCallback(() => {
    if (accountRef.current) sync(accountRef.current);
  }, [sync]);

  return {
    profiles,
    selectedId,
    selectedProfile,
    ready,
    syncStatus,
    uploadOffer,
    selectProfile,
    addProfile,
    updateSelectedProfile,
    removeProfile,
    saveToAccount,
    confirmUploadOffer,
    dismissUploadOffer,
    retrySync,
  };
}
