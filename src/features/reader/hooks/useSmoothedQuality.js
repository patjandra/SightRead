import { useMemo, useRef } from "react";
import { qualityLevel, scoreFeatures } from "../gaze/trackingQuality.js";

// Per-frame smoothing weights. The aura gets worse quickly (so a real problem
// shows at once) and recovers slowly (so it doesn't flicker between colours).
const WORSEN = 0.35;
const RECOVER = 0.06;

/**
 * Smooths the per-frame quality score from the gaze estimator and maps it to a
 * colour level. Returns null while inactive.
 *
 * @param {{ quality?: number }} gazeData
 * @param {boolean} active
 * @param {object|null} [spot] - sweet spot learned from the dot test; the defaults
 *   are used when null
 * @returns {{ score: number, level: "green"|"yellow"|"orange"|"red" } | null}
 */
export function useSmoothedQuality(gazeData, active, spot = null) {
  const scoreRef = useRef(1);

  return useMemo(() => {
    if (!active) {
      scoreRef.current = 1;
      return null;
    }
    let target = gazeData.quality ?? 0;
    // Quality 0 means tracking is paused (no face, cut off); that stays red. Any
    // other frame is re-scored against the learned sweet spot when there is one.
    if (spot && target > 0 && gazeData.features) {
      target = scoreFeatures(gazeData.features, spot).score;
    }
    const prev = scoreRef.current;
    scoreRef.current = prev + (target - prev) * (target < prev ? WORSEN : RECOVER);
    return { score: scoreRef.current, level: qualityLevel(scoreRef.current) };
  }, [gazeData, active, spot]);
}
