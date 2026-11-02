import { useEffect, useRef } from "react";
import { createScrollController } from "../scroll/scrollController.js";
import { mapRawToCalibratedY } from "../gaze/calibrationManager.js";

/**
 * Drives scroll on the given containerRef, once per animation frame, using gaze
 * data. Running on requestAnimationFrame (~60fps) rather than a 20Hz interval
 * gives smaller, more frequent steps that read as smooth motion.
 *
 * @param {object} params
 * @param {{ rawY: number, confidence: number, hasFace: boolean }} params.gazeData
 * @param {object|null} params.selectedProfile
 * @param {boolean} params.isTracking   - user has enabled tracking
 * @param {number}  params.sensitivity  - 0.25–2.0
 * @param {number}  params.confidenceThreshold
 * @param {React.RefObject} params.scrollContainerRef
 * @returns {{ calibratedY: number|null }}
 */
export function useScrollControl({
  gazeData,
  selectedProfile,
  isTracking,
  sensitivity,
  confidenceThreshold,
  scrollContainerRef,
}) {
  const controllerRef = useRef(createScrollController());
  const lastTickRef = useRef(null);
  const rafRef = useRef(null);
  // Carries the fractional pixel remainder between frames so small per-frame
  // deltas (which scrollTop would otherwise round away) still accumulate.
  const scrollAccumRef = useRef(0);

  // Keep a ref to the latest values so the interval callback doesn't stale-close
  const stateRef = useRef({});
  stateRef.current = {
    gazeData,
    selectedProfile,
    isTracking,
    sensitivity,
    confidenceThreshold,
  };

  useEffect(() => {
    function tick() {
      const {
        gazeData: gaze,
        selectedProfile: profile,
        isTracking: tracking,
        sensitivity: sens,
        confidenceThreshold: threshold,
      } = stateRef.current;

      const container = scrollContainerRef.current;

      if (
        !tracking ||
        !profile ||
        !container ||
        !gaze.hasFace ||
        gaze.confidence < threshold
      ) {
        controllerRef.current.reset();
        lastTickRef.current = null;
        scrollAccumRef.current = 0;
        rafRef.current = requestAnimationFrame(tick);
        return;
      }

      const calibratedY = mapRawToCalibratedY(gaze.rawY, profile);
      if (calibratedY === null) {
        rafRef.current = requestAnimationFrame(tick);
        return;
      }

      const now = performance.now();
      const deltaTimeSec =
        lastTickRef.current !== null ? (now - lastTickRef.current) / 1000 : 0;
      lastTickRef.current = now;

      const delta = controllerRef.current.update(calibratedY, deltaTimeSec, sens);

      // Accumulate fractional pixels; apply only the whole-pixel part so the
      // remainder isn't lost to scrollTop rounding between frames.
      scrollAccumRef.current += delta;
      const whole = Math.trunc(scrollAccumRef.current);
      if (whole !== 0) {
        scrollAccumRef.current -= whole;
        const maxScroll = container.scrollHeight - container.clientHeight;
        container.scrollTop = Math.min(
          maxScroll,
          Math.max(0, container.scrollTop + whole)
        );
      }

      rafRef.current = requestAnimationFrame(tick);
    }

    rafRef.current = requestAnimationFrame(tick);

    return () => {
      if (rafRef.current) cancelAnimationFrame(rafRef.current);
      controllerRef.current.reset();
    };
  }, [scrollContainerRef]); // intentionally only re-run if the container ref identity changes

  // Expose calibratedY for debug display (computed on-demand, not stored in state)
  const getCalibratedY = () => {
    if (!selectedProfile) return null;
    return mapRawToCalibratedY(gazeData.rawY, selectedProfile);
  };

  return { getCalibratedY };
}
