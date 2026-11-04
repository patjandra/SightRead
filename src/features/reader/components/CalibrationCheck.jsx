import React, { useEffect, useRef, useState } from "react";
import { mapRawToCalibratedY, isUsableSample, SETTLE_MS } from "../gaze/calibrationManager.js";
import { createOneEuroFilter } from "../gaze/oneEuroFilter.js";
import { learnSweetSpot } from "../gaze/trackingQuality.js";
import {
  SCROLL_UP_THRESHOLD,
  SCROLL_DOWN_THRESHOLD,
  GAZE_FILTER_MIN_CUTOFF,
  GAZE_FILTER_BETA,
} from "../../../config.js";

// Readings needed to set the green zone. A reading only counts while the gaze dot
// is held in the central band, so this is the number of frames spent reading
// there. At ~30 fps that is about five seconds, enough for the range to settle
// (the learned range uses the 10th-90th percentile) and for the head to move
// through its natural range. A faster camera finishes sooner.
export const GREEN_ZONE_READINGS = 150;

// Ring geometry around the dot: 56x56 box, viewBox 0 0 56 56.
const RING_R = 25;
const RING_C = 2 * Math.PI * RING_R;

/**
 * "Try it" step after a capture. A dot follows the mapped gaze, with the scroll-up
 * and scroll-down zones shaded, so the user can see whether the calibration feels
 * right before it is saved.
 *
 * It also sets the green zone of the tracking aura: while the dot is held in the
 * central band, the face's position, size and turn are recorded, and a ring
 * around the dot fills as the readings accumulate. The dot must stay in the band
 * until the ring is full; leaving it resets the progress. "Looks good" unlocks when the
 * ring is full, and onAccept(spot) receives the learned green zone. "Skip" calls
 * onAccept(null) to use the default zone instead.
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

  // Face measurements taken only while the dot is held in the central band. The
  // dot has to stay there until the ring is full: once it leaves the band while
  // tracking is confident, the progress starts over. Frames with no usable reading
  // (a blink, eyes turned sideways, face lost) neither count nor reset it.
  const samplesRef = useRef([]);
  const [count, setCount] = useState(0);
  useEffect(() => {
    if (samplesRef.current.length >= GREEN_ZONE_READINGS) return;
    if (!confident) return;
    if (zone !== "neutral") {
      if (samplesRef.current.length > 0) {
        samplesRef.current = [];
        setCount(0);
      }
      return;
    }
    if (gazeData.features && isUsableSample(gazeData, SETTLE_MS)) {
      samplesRef.current.push(gazeData.features);
      setCount(samplesRef.current.length);
    }
  }, [gazeData]); // eslint-disable-line react-hooks/exhaustive-deps

  const progress = Math.min(1, count / GREEN_ZONE_READINGS);
  const ready = count >= GREEN_ZONE_READINGS;

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

      {/* The gaze dot, with a ring that fills with the green-zone readings */}
      <div
        className="absolute w-14 h-14 -translate-x-1/2 -translate-y-1/2"
        style={{ left: "50%", top: `${y * 100}%` }}
      >
        <svg
          className="absolute inset-0 w-full h-full"
          viewBox="0 0 56 56"
          style={{ transform: "rotate(-90deg)" }}
          aria-hidden="true"
        >
          <circle cx="28" cy="28" r={RING_R} fill="none" stroke="rgba(255,255,255,0.12)" strokeWidth="4" />
          <circle
            cx="28" cy="28" r={RING_R} fill="none"
            stroke="#4ade80" strokeWidth="4" strokeLinecap="round"
            strokeDasharray={`${progress * RING_C} ${RING_C}`}
          />
        </svg>
        <div
          className={`absolute inset-3 rounded-full ${
            confident ? (zone === "neutral" ? "bg-green-400" : "bg-amber-400") : "bg-gray-600"
          }`}
        />
      </div>

      {/* Off to the side, so it never covers the dot's central band */}
      <div className="absolute right-8 top-1/2 -translate-y-1/2 pointer-events-none">
        <div className="bg-gray-800/90 rounded-2xl px-6 py-4 text-center max-w-xs shadow-xl pointer-events-auto">
          <p className="text-white font-semibold text-base mb-1">Try it</p>
          <p className="text-gray-400 text-sm leading-snug mb-2">
            The dot follows your gaze and turns amber only in the shaded scroll zones.
          </p>
          <p className="text-gray-400 text-sm leading-snug mb-3">
            Now hold it in the middle band while you move your head a little, as you
            would when reading. Keep it there until the ring is full. If it leaves the
            band, the ring starts over. That sets your green zone.
          </p>
          <p className="text-gray-300 text-xs font-mono mb-3 tabular-nums">
            {count} / {GREEN_ZONE_READINGS} readings
          </p>
          <div className="flex justify-center gap-2">
            <button
              className="bg-indigo-600 hover:bg-indigo-500 disabled:opacity-40 disabled:hover:bg-indigo-600 rounded px-4 py-1.5 text-sm font-medium"
              onClick={() => onAccept(learnSweetSpot(samplesRef.current))}
              disabled={!ready}
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
          <button
            className="mt-3 text-xs text-gray-500 hover:text-gray-300 underline"
            onClick={() => onAccept(null)}
          >
            Skip (use the default green zone)
          </button>
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
