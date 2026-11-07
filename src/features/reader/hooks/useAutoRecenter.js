import { useMemo, useRef } from "react";
import { isUsableSample, mapRawToCalibratedY } from "../gaze/calibrationManager.js";
import { createDriftEstimator } from "../gaze/driftEstimator.js";

/**
 * Keeps the gaze aligned when the user's head settles in a new pose, with no
 * pop-up: a small session-only offset (see gaze/driftEstimator.js). It learns only while `active` (tracking). Pausing
 * tracking keeps the correction for the rest of the page visit, so the next start
 * begins with it and re-checks it during a short warm-up. Turning the feature
 * off (`enabled` false) or changing `resetKey` (profile, manual recenter,
 * recalibration) clears it.
 *
 * @param {object} params
 * @param {object} params.gazeData
 * @param {object|null} params.profile
 * @param {number} params.manualOffset - the explicit Recenter offset, applied first
 * @param {number|null|undefined} params.score - smoothed tracking quality 0..1
 * @param {boolean} params.enabled - the feature is on and the profile is calibrated
 * @param {boolean} params.active - tracking is running
 * @param {string} params.resetKey
 * @returns {number} offset to add to the manual one (raw units)
 */
export function useAutoRecenter({ gazeData, profile, manualOffset, score, enabled, active, resetKey }) {
  const estimatorRef = useRef(null);
  if (!estimatorRef.current) estimatorRef.current = createDriftEstimator();
  const keyRef = useRef(resetKey);
  const offsetRef = useRef(0);

  return useMemo(() => {
    const est = estimatorRef.current;
    if (keyRef.current !== resetKey || !enabled || !profile) {
      keyRef.current = resetKey;
      est.reset();
      offsetRef.current = 0;
      return 0;
    }
    if (!active) {
      est.pause();
      return offsetRef.current;
    }

    const { top, bottom } = profile.points;
    const range = bottom - top;
    if (!(range > 0)) return offsetRef.current;

    const rawY = gazeData.rawY - manualOffset;
    const { offset } = est.update({
      t: performance.now(),
      rawY,
      calibratedY: mapRawToCalibratedY(rawY, profile, est.offset),
      usable: gazeData.hasFace && isUsableSample(gazeData, Infinity),
      score: score ?? 0,
      features: gazeData.features ?? null,
      range,
    });
    offsetRef.current = offset;
    return offset;
  }, [gazeData, profile, manualOffset, score, enabled, active, resetKey]);
}
