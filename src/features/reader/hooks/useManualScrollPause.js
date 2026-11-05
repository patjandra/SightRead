import { useEffect, useRef } from "react";
import { isScrollKeyEvent, isTypingTarget } from "../keybind.js";

// Controls that use scroll keys themselves (a slider's arrows) mark their
// section data-no-scroll-pause so using them doesn't pause tracking.
const inOptOut = (target) => !!target?.closest?.("[data-no-scroll-pause]");

/**
 * While `active`, calls `onManualScroll` the moment the user scrolls the reader
 * themselves: mouse wheel or trackpad, touch drag, or a scrolling key. Listens
 * for the input events rather than `scroll`, because gaze scrolling also fires
 * `scroll` and must not count.
 */
export function useManualScrollPause({ active, containerRef, onManualScroll }) {
  const callback = useRef(onManualScroll);
  callback.current = onManualScroll;

  useEffect(() => {
    const container = containerRef.current;
    if (!active || !container) return;

    const fire = () => callback.current();
    const onKey = (e) => {
      if (isScrollKeyEvent(e) && !isTypingTarget(e.target) && !inOptOut(e.target)) fire();
    };

    container.addEventListener("wheel", fire, { passive: true });
    container.addEventListener("touchmove", fire, { passive: true });
    window.addEventListener("keydown", onKey);
    return () => {
      container.removeEventListener("wheel", fire);
      container.removeEventListener("touchmove", fire);
      window.removeEventListener("keydown", onKey);
    };
  }, [active, containerRef]);
}
