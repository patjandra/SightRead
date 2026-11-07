import { useCallback, useState } from "react";

// Whether automatic recentering is on. A harmless UI preference (no account
// data), so it stays in localStorage like the sidebar section state.
const STORAGE_KEY = "sightread-auto-recenter";

/** On unless the user switched it off. */
export function useAutoRecenterPref() {
  const [on, setOn] = useState(() => {
    try {
      return localStorage.getItem(STORAGE_KEY) !== "off";
    } catch {
      return true;
    }
  });

  const set = useCallback((next) => {
    setOn(next);
    try {
      localStorage.setItem(STORAGE_KEY, next ? "on" : "off");
    } catch {
      // Storage unavailable: the switch still works for this visit.
    }
  }, []);

  return [on, set];
}
