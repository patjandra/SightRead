import React, { useState, useEffect, useRef } from "react";
import { calibratedToRaw, isUsableSample } from "../gaze/calibrationManager.js";
import { SCROLL_BAND_CENTER } from "../../../config.js";
import { trimmedMedian } from "../gaze/stats.js";

const LEAD_MS = 800;       // a beat to find the dot before sampling starts
const TARGET_SAMPLES = 30;
const MAX_MS = 4000;
const MIN_SAMPLES = 12;

/**
 * One-dot realignment: the user looks at the middle of the screen and the gap
 * between that reading and the middle of the no-scroll band becomes a session
 * offset, so a resting gaze sits equally far from the scroll-up and scroll-down
 * edges.
 * Calls onDone(offset) on success or onDone(null) when cancelled.
 */
export default function RecenterScreen({ gazeData, profile, onDone }) {
  const [phase, setPhase] = useState("lead"); // lead | collecting | failed
  const [progress, setProgress] = useState(0);
  const samplesRef = useRef([]);
  const startRef = useRef(0);
  const [attempt, setAttempt] = useState(0);

  useEffect(() => {
    setPhase("lead");
    setProgress(0);
    samplesRef.current = [];
    let lead = setTimeout(() => {
      startRef.current = performance.now();
      setPhase("collecting");
    }, LEAD_MS);
    return () => clearTimeout(lead);
  }, [attempt]);

  // Take settled, on-target frames while collecting.
  useEffect(() => {
    if (phase !== "collecting") return;
    const elapsed = performance.now() - startRef.current;
    if (isUsableSample(gazeData, elapsed) && samplesRef.current.length < TARGET_SAMPLES) {
      samplesRef.current.push(gazeData.rawY);
      setProgress(samplesRef.current.length / TARGET_SAMPLES);
    }
    const n = samplesRef.current.length;
    if (n >= TARGET_SAMPLES || (elapsed >= MAX_MS && n >= MIN_SAMPLES)) {
      onDone(trimmedMedian(samplesRef.current) - calibratedToRaw(SCROLL_BAND_CENTER, profile));
    } else if (elapsed >= MAX_MS) {
      setPhase("failed");
    }
  }, [gazeData, phase]); // eslint-disable-line react-hooks/exhaustive-deps

  const failed = phase === "failed";

  return (
    <div className="fixed inset-0 z-40 bg-gray-950 select-none">
      <div
        className="absolute"
        style={{ top: "50%", left: "50%", transform: "translate(-50%, -50%)" }}
      >
        <div
          className={`w-10 h-10 rounded-full transition-colors duration-200 ${
            failed ? "bg-red-400" : phase === "collecting" ? "bg-green-400" : "bg-white"
          }`}
          style={{ opacity: 0.4 + 0.6 * progress }}
        />
      </div>

      <div className="absolute inset-x-0 bottom-16 flex justify-center">
        <div className="bg-gray-800/90 rounded-2xl px-6 py-4 text-center max-w-xs shadow-xl">
          {failed ? (
            <>
              <p className="text-white font-semibold text-base mb-1">Let’s try that again</p>
              <p className="text-gray-400 text-sm leading-snug mb-3">
                {gazeData.hint || "Look right at the dot and keep your face in view."}
              </p>
              <button
                className="bg-indigo-600 hover:bg-indigo-500 rounded px-4 py-1.5 text-sm font-medium"
                onClick={() => setAttempt((a) => a + 1)}
              >
                Retry
              </button>
            </>
          ) : (
            <>
              <p className="text-white font-semibold text-base mb-1">Look at the middle dot</p>
              <p className="text-gray-400 text-sm leading-snug">
                {phase === "lead" ? "Get ready…" : "Hold still"}
              </p>
            </>
          )}
        </div>
      </div>

      <button
        className="absolute bottom-5 inset-x-0 text-center text-xs text-gray-600 hover:text-gray-400 underline"
        onClick={() => onDone(null)}
      >
        Cancel
      </button>
    </div>
  );
}
