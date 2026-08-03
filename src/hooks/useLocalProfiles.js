import { useState, useEffect, useCallback } from "react";
import {
  getAllProfiles,
  getSelectedProfileId,
  setSelectedProfileId,
  createProfile,
  updateProfile,
  deleteProfile,
} from "../gaze/profileStore.js";

/**
 * React binding over the IndexedDB profile store.
 *
 * The store is async, so profiles start empty and hydrate on mount (`ready`
 * flips true once loaded). Every mutation writes through to IndexedDB and then
 * mirrors the persisted result back into React state, so what's on screen always
 * matches what's stored. The returned API is otherwise the same as before, so
 * callers are unaffected by the storage swap.
 */
export function useLocalProfiles() {
  const [profiles, setProfiles] = useState([]);
  const [selectedId, setSelectedId] = useState(null);
  const [ready, setReady] = useState(false);

  // Hydrate from IndexedDB once on mount.
  useEffect(() => {
    let cancelled = false;
    (async () => {
      const [loadedProfiles, loadedSelected] = await Promise.all([
        getAllProfiles(),
        getSelectedProfileId(),
      ]);
      if (cancelled) return;
      setProfiles(loadedProfiles);
      setSelectedId(loadedSelected);
      setReady(true);
    })().catch((err) => {
      // A storage failure shouldn't crash the app; log and continue empty.
      console.error("[SightRead] Failed to load profiles:", err);
      if (!cancelled) setReady(true);
    });
    return () => {
      cancelled = true;
    };
  }, []);

  const selectedProfile = profiles.find((p) => p.id === selectedId) || null;

  const selectProfile = useCallback((id) => {
    setSelectedId(id);
    setSelectedProfileId(id);
  }, []);

  const addProfile = useCallback(async (name, points) => {
    const profile = await createProfile(name, points);
    setProfiles(await getAllProfiles());
    setSelectedId(profile.id);
    await setSelectedProfileId(profile.id);
    return profile;
  }, []);

  const updateSelectedProfile = useCallback(
    async (points) => {
      if (!selectedId) return null;
      const profile = await updateProfile(selectedId, points);
      setProfiles(await getAllProfiles());
      return profile;
    },
    [selectedId]
  );

  const removeProfile = useCallback(async (id) => {
    await deleteProfile(id);
    setProfiles(await getAllProfiles());
    setSelectedId(await getSelectedProfileId());
  }, []);

  return {
    profiles,
    selectedId,
    selectedProfile,
    ready,
    selectProfile,
    addProfile,
    updateSelectedProfile,
    removeProfile,
  };
}
