import React, { useRef } from "react";
import { mapRawToCalibratedY } from "../gaze/calibrationManager.js";
import { createOneEuroFilter } from "../gaze/oneEuroFilter.js";
import {
  SCROLL_UP_THRESHOLD,
  SCROLL_DOWN_THRESHOLD,
  GAZE_FILTER_MIN_CUTOFF,
  GAZE_FILTER_BETA,
} from "../../../config.js";

/**
 * "Try it" step after a capture: a dot follows the mapped gaze, with the
 * scroll-up and scroll-down zones shaded. The user sees whether the calibration
 * feels right before it is saved to the profile.
 */
export default function CalibrationCheck({ gazeData, points, onAccept, onRedo, onCancel }) {
  const filterRef = useRef(null);
  const lastRef = useRef({ t: null, y: 0.5 });
  if (!filterRef.current) {
    filterRef.current = createOneEuroFilter({
      minCutoff: GAZE_FILTER_MIN_CUTOFF,
      beta: GAZE_FILTER_BETA,
    });
  }

  // Smooth the mapped position the same way the scroll controller does, so the
  // dot moves as the reader will behave.
  const confident = gazeData.hasFace && gazeData.confidence >= 0.5;
  if (confident) {
    const y = mapRawToCalibratedY(gazeData.rawY, { points });
    if (y !== null) {
      const now = performance.now();
      const dt = lastRef.current.t === null ? 0 : (now - lastRef.current.t) / 1000;
      lastRef.current = { t: now, y: filterRef.current.filter(y, dt) };
    }
  } else {
    lastRef.current.t = null;
  }
  const y = lastRef.current.y;
  const zone = y < SCROLL_UP_THRESHOLD ? "up" : y > SCROLL_DOWN_THRESHOLD ? "down" : "neutral";

  return (
    <div className="fixed inset-0 z-40 bg-gray-950 select-none">
      <div
        className="absolute inset-x-0 top-0 bg-indigo-500/10 border-b border-indigo-400/30 text-[11px] text-indigo-300 px-3 py-1"
        style={{ height: `${SCROLL_UP_THRESHOLD * 100}%` }}
      >
        scrolls up
      </div>
      <div
        className="absolute inset-x-0 bottom-0 bg-indigo-500/10 border-t border-indigo-400/30 text-[11px] text-indigo-300 px-3 py-1 flex items-end"
        style={{ height: `${(1 - SCROLL_DOWN_THRESHOLD) * 100}%` }}
      >
        scrolls down
      </div>

      <div
        className={`absolute w-8 h-8 rounded-full -translate-x-1/2 -translate-y-1/2 ${
          confident ? (zone === "neutral" ? "bg-green-400" : "bg-amber-400") : "bg-gray-600"
        }`}
        style={{ left: "50%", top: `${y * 100}%` }}
      />

      <div className="absolute inset-x-0 top-1/2 -translate-y-1/2 flex justify-center pointer-events-none">
        <div className="bg-gray-800/90 rounded-2xl px-6 py-4 text-center max-w-xs shadow-xl pointer-events-auto">
          <p className="text-white font-semibold text-base mb-1">Try it</p>
          <p className="text-gray-400 text-sm leading-snug mb-3">
            Look around the screen. The dot should follow your gaze, and turn amber
            only in the shaded scroll zones.
          </p>
          <div className="flex justify-center gap-2">
            <button
              className="bg-indigo-600 hover:bg-indigo-500 rounded px-4 py-1.5 text-sm font-medium"
              onClick={onAccept}
            >
              Looks good
            </button>
            <button
              className="bg-gray-700 hover:bg-gray-600 rounded px-4 py-1.5 text-sm font-medium"
              onClick={onRedo}
            >
              Redo
            </button>
          </div>
        </div>
      </div>

      <button
        className="absolute bottom-5 inset-x-0 text-center text-xs text-gray-600 hover:text-gray-400 underline"
        onClick={onCancel}
      >
        Discard
      </button>
    </div>
  );
}
