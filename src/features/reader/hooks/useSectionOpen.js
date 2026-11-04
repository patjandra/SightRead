import { useCallback, useState } from "react";

// One small UI preference (which sidebar sections are expanded). Holds no
// account data, so it stays in localStorage and survives sign-out.
const STORAGE_KEY = "sightread-sections";

function readAll() {
  try {
    const parsed = JSON.parse(localStorage.getItem(STORAGE_KEY));
    return parsed && typeof parsed === "object" ? parsed : {};
  } catch {
    return {};
  }
}

/** Expanded/collapsed state of a named section, remembered across reloads. */
export function useSectionOpen(name) {
  const [open, setOpen] = useState(() => readAll()[name] !== false);

  const toggle = useCallback(() => {
    setOpen((current) => {
      const next = !current;
      try {
        localStorage.setItem(STORAGE_KEY, JSON.stringify({ ...readAll(), [name]: next }));
      } catch {
        // Storage unavailable (private mode, quota): the toggle still works for this visit.
      }
      return next;
    });
  }, [name]);

  return [open, toggle];
}
