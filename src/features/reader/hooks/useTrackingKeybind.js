import { useEffect, useRef } from "react";
import { matchesBinding, isTypingTarget } from "../keybind.js";

/** Calls `onToggle` when the user presses the bound shortcut (not while typing or capturing a new one). */
export function useTrackingKeybind({ binding, disabled, onToggle }) {
  const toggle = useRef(onToggle);
  toggle.current = onToggle;

  useEffect(() => {
    if (!binding || disabled) return;
    const onKey = (e) => {
      if (e.repeat || isTypingTarget(e.target) || !matchesBinding(binding, e)) return;
      e.preventDefault();
      toggle.current();
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [binding, disabled]);
}
