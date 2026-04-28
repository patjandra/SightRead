import { useEffect, useRef } from "react";
import { createScrollController } from "../scroll/scrollController.js";
import { mapRawToCalibratedY } from "../gaze/calibrationManager.js";

const SCROLL_HZ = 20;
const INTERVAL_MS = 1000 / SCROLL_HZ;

/**
 * Drives scroll on the given containerRef at SCROLL_HZ using gaze data.
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
  const intervalRef = useRef(null);

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
        return;
      }

      const calibratedY = mapRawToCalibratedY(gaze.rawY, profile);
      if (calibratedY === null) return;

      const now = performance.now();
      const deltaTimeSec =
        lastTickRef.current !== null
          ? (now - lastTickRef.current) / 1000
          : INTERVAL_MS / 1000;
      lastTickRef.current = now;

      const delta = controllerRef.current.update(calibratedY, deltaTimeSec, sens);

      if (delta !== 0) {
        const maxScroll = container.scrollHeight - container.clientHeight;
        const next = Math.min(
          maxScroll,
          Math.max(0, container.scrollTop + delta)
        );
        container.scrollTop = next;
      }
    }

    intervalRef.current = setInterval(tick, INTERVAL_MS);

    return () => {
      clearInterval(intervalRef.current);
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
