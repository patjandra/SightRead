import { useState, useCallback } from "react";
import {
  loadProfiles,
  saveSelectedProfileId,
  loadSelectedProfileId,
  createProfile,
  updateProfile,
  deleteProfile,
} from "../gaze/calibrationManager.js";

export function useLocalProfiles() {
  const [profiles, setProfiles] = useState(() => loadProfiles());
  const [selectedId, setSelectedId] = useState(() => loadSelectedProfileId());

  const selectedProfile =
    profiles.find((p) => p.id === selectedId) || null;

  const selectProfile = useCallback((id) => {
    setSelectedId(id);
    saveSelectedProfileId(id);
  }, []);

  const addProfile = useCallback((name, points) => {
    const profile = createProfile(name, points);
    setProfiles(loadProfiles());
    setSelectedId(profile.id);
    saveSelectedProfileId(profile.id);
    return profile;
  }, []);

  const updateSelectedProfile = useCallback(
    (points) => {
      if (!selectedId) return null;
      const profile = updateProfile(selectedId, points);
      setProfiles(loadProfiles());
      return profile;
    },
    [selectedId]
  );

  const removeProfile = useCallback(
    (id) => {
      deleteProfile(id);
      const updated = loadProfiles();
      setProfiles(updated);
      const newSelected = loadSelectedProfileId();
      setSelectedId(newSelected);
    },
    []
  );

  return {
    profiles,
    selectedId,
    selectedProfile,
    selectProfile,
    addProfile,
    updateSelectedProfile,
    removeProfile,
  };
}
