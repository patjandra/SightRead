import React, { useState, useEffect, useRef, useCallback } from "react";

const STEPS = [
  { key: "top",    label: "top",    dotTop: "13%" },
  { key: "center", label: "center", dotTop: "50%" },
  { key: "bottom", label: "bottom", dotTop: "83%" },
];

const COLLECT_MS   = 1500;
const COUNTDOWN_N  = 3;
const COUNTDOWN_MS = 800;

// ─── Robustness thresholds ───────────────────────────────────────────────────
// Minimum on-target samples needed to trust a step. Frames are only counted
// when the face is detected, confident, AND looking roughly straight at the
// (horizontally centered) dot — so too few means the user wasn't looking there.
const MIN_SAMPLES = 10;
// Max standard deviation of a step's samples. A steady fixation is tight; a
// wandering or interrupted gaze spreads out and is rejected.
const MAX_STDDEV = 0.10;
// Reject frames where the eyes are turned to the side instead of at the dot.
const SIDE_GAZE_MAX = 0.35;
// Adjacent calibration points must be at least this far apart, in order
// (top < center < bottom), or the mapping can't separate the zones.
const MIN_SEPARATION = 0.05;
// The full top→bottom gaze range must span at least this much. This is the key
// guard against "calibrating" without actually moving your eyes to the dots: if
// you stare straight ahead the three readings barely differ and are rejected.
const MIN_TOTAL_SPAN = 0.16;

function median(values) {
  const sorted = [...values].sort((a, b) => a - b);
  const mid = Math.floor(sorted.length / 2);
  return sorted.length % 2 === 0
    ? (sorted[mid - 1] + sorted[mid]) / 2
    : sorted[mid];
}

function stddev(values) {
  const mean = values.reduce((a, b) => a + b, 0) / values.length;
  const variance =
    values.reduce((a, b) => a + (b - mean) ** 2, 0) / values.length;
  return Math.sqrt(variance);
}

// Ring geometry — container is 80×80px, SVG viewBox 0 0 80 80
const RING_CX = 40;
const RING_CY = 40;
const RING_R  = 33;
const RING_C  = 2 * Math.PI * RING_R; // ≈ 207.3

export default function CalibrationScreen({ gazeData, onComplete, onCancel }) {
  const [stepIndex, setStepIndex] = useState(0);
  const [phase,     setPhase]     = useState("countdown");
  const [countdown, setCountdown] = useState(COUNTDOWN_N);
  const [progress,  setProgress]  = useState(0);
  const [points,    setPoints]    = useState({});
  const [failReason, setFailReason] = useState("");

  const samplesRef      = useRef([]);
  const timerRef        = useRef(null);
  const collectStartRef = useRef(null);
  const rafRef          = useRef(null);
  // "step" → retry re-runs the current step; "all" → restart the whole thing.
  const failModeRef     = useRef("step");
  // Last framing problem seen while collecting, for a targeted failure message.
  const framingHintRef  = useRef(null);

  const step = STEPS[stepIndex];

  const clearTimers = useCallback(() => {
    clearInterval(timerRef.current);
    cancelAnimationFrame(rafRef.current);
  }, []);

  // Run the countdown then start collecting for the current step.
  // NOTE: intentionally a plain function (not useCallback) so it always closes
  // over the CURRENT render's stepIndex/points via beginCollecting → finishStep.
  // Memoizing it froze that closure to the first render, making finishStep think
  // stepIndex was always 0 — so it advanced past the last step and crashed.
  function startStep() {
    clearTimers();
    setPhase("countdown");
    setCountdown(COUNTDOWN_N);
    setProgress(0);
    samplesRef.current = [];

    let count = COUNTDOWN_N;
    timerRef.current = setInterval(() => {
      count -= 1;
      if (count <= 0) {
        clearInterval(timerRef.current);
        beginCollecting();
      } else {
        setCountdown(count);
      }
    }, COUNTDOWN_MS);
  }

  useEffect(() => {
    startStep();
    return clearTimers;
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [stepIndex]);

  function beginCollecting() {
    setPhase("collecting");
    collectStartRef.current = performance.now();
    samplesRef.current = [];
    framingHintRef.current = null;

    function frame() {
      const elapsed = performance.now() - collectStartRef.current;
      const prog = Math.min(1, elapsed / COLLECT_MS);
      setProgress(prog);
      if (prog < 1) {
        rafRef.current = requestAnimationFrame(frame);
      } else {
        finishStep();
      }
    }
    rafRef.current = requestAnimationFrame(frame);
  }

  // Collect a sample only when the face is confidently tracked AND the eyes are
  // looking roughly straight at the dot (not off to the side).
  useEffect(() => {
    if (phase !== "collecting") return;

    // Remember any framing problem (face out of frame / mis-positioned) so a
    // failed step can tell the user to fix their position specifically.
    if (!gazeData.hasFace || gazeData.hint) {
      framingHintRef.current =
        gazeData.hint || "Keep your whole face in the camera view.";
    }

    const onTarget =
      gazeData.confidence >= 0.5 &&
      gazeData.hasFace &&
      (gazeData.sideGaze ?? 0) < SIDE_GAZE_MAX;
    if (onTarget) {
      samplesRef.current.push(gazeData.rawY);
    }
  }, [gazeData, phase]);

  function failStep(reason, mode = "step") {
    failModeRef.current = mode;
    setFailReason(reason);
    setPhase("failed");
  }

  function finishStep() {
    const samples = samplesRef.current;

    // Not enough on-target frames. If framing was the problem (face out of or
    // poorly positioned in frame), say so specifically; otherwise the user was
    // looking away from the dot. Retry rather than saving a bad point.
    if (samples.length < MIN_SAMPLES) {
      failStep(
        framingHintRef.current ||
          "Look directly at the dot and keep your face centered."
      );
      return;
    }

    // Unsteady gaze (glancing around) spreads the samples out — reject it so a
    // noisy reading can't distort the mapping.
    if (stddev(samples) > MAX_STDDEV) {
      failStep("Try to hold your gaze still on the dot.");
      return;
    }

    // Median is robust to the occasional stray frame.
    const value = median(samples);

    const newPoints = { ...points, [step.key]: value };
    setPoints(newPoints);

    if (stepIndex < STEPS.length - 1) {
      setPhase("done");
      setTimeout(() => setStepIndex((i) => i + 1), 350);
      return;
    }

    // Final consistency check across all three points. Two conditions:
    //  1. They must increase in order (top < center < bottom) with separation —
    //     otherwise a step was mis-captured (e.g. looked the wrong way).
    //  2. The overall top→bottom span must be substantial — otherwise the eyes
    //     never really travelled between the dots (e.g. stared straight ahead),
    //     and the resulting mapping would make tiny gaze shifts scroll wildly.
    // Either failure means redo the whole calibration.
    const { top, center, bottom } = newPoints;
    const ordered =
      top + MIN_SEPARATION <= center && center + MIN_SEPARATION <= bottom;
    const enoughSpan = bottom - top >= MIN_TOTAL_SPAN;
    if (!ordered || !enoughSpan) {
      failStep(
        !ordered
          ? "Those readings didn't line up. Redo it and look straight at each dot in turn."
          : "Your gaze barely moved. Look up at the top dot and down at the bottom dot.",
        "all"
      );
      return;
    }

    setPhase("done");
    setTimeout(() => onComplete(newPoints), 350);
  }

  // Retry after a failed capture — either the current step or the whole run.
  function retry() {
    if (failModeRef.current === "all") {
      setPoints({});
      if (stepIndex === 0) {
        startStep();
      } else {
        setStepIndex(0); // the stepIndex effect restarts the run
      }
    } else {
      startStep();
    }
  }

  // Inner dot colour
  const dotColor =
    phase === "collecting" ? "bg-green-400" :
    phase === "done"       ? "bg-blue-400"  :
    phase === "failed"     ? "bg-red-400"   :
    "bg-white";

  // Ring progress colour (stroke)
  const ringStroke =
    phase === "collecting" ? "#4ade80" :   // green-400
    phase === "done"       ? "#60a5fa" :   // blue-400
    phase === "failed"     ? "#f87171" :   // red-400
    "#e5e7eb";                              // gray-200 during countdown

  const progressDash = `${progress * RING_C} ${RING_C}`;

  // The instruction card sits on the OPPOSITE end of the screen from the dot
  // so it can never overlap it, regardless of screen height.
  const cardAtBottom = stepIndex !== 2; // top + center → card at bottom; bottom → card at top

  // Live framing feedback while positioning/collecting, so the user can get
  // their face into frame before the capture is spoiled.
  const framingProblem =
    (phase === "countdown" || phase === "collecting") &&
    (!gazeData.hasFace || !!gazeData.hint);
  const framingMessage =
    gazeData.hint || "No face detected — move into the camera view.";

  return (
    <div className="fixed inset-0 z-40 bg-gray-950 select-none">

      {/* Step counter badge — top-centre, above even the top dot (13%) */}
      <div className="absolute top-4 inset-x-0 flex justify-center pointer-events-none">
        <span className="bg-gray-800 text-gray-400 text-xs font-medium px-3 py-1 rounded-full">
          {stepIndex + 1} / {STEPS.length}
        </span>
      </div>

      {/* ── Dot ── */}
      <div
        className="absolute"
        style={{
          top: step.dotTop,
          left: "50%",
          transform: "translate(-50%, -50%)",
        }}
      >
        {/* Outer container sized to fit the ring */}
        <div className="relative w-20 h-20">

          {/* SVG ring — always rendered so the track is always visible */}
          <svg
            className="absolute inset-0 w-full h-full"
            viewBox="0 0 80 80"
            style={{ transform: "rotate(-90deg)" }}
          >
            {/* Track — shows the full circle faintly so the user knows a ring exists */}
            <circle
              cx={RING_CX} cy={RING_CY} r={RING_R}
              fill="none"
              stroke="rgba(255,255,255,0.12)"
              strokeWidth="5"
            />
            {/* Progress arc */}
            <circle
              cx={RING_CX} cy={RING_CY} r={RING_R}
              fill="none"
              stroke={ringStroke}
              strokeWidth="5"
              strokeLinecap="round"
              strokeDasharray={progressDash}
              style={{ transition: "stroke 0.2s" }}
            />
          </svg>

          {/* Inner dot */}
          <div className="absolute inset-0 flex items-center justify-center">
            <div
              className={`w-10 h-10 rounded-full flex items-center justify-center transition-colors duration-200 ${dotColor}`}
            >
              {phase === "countdown" && (
                <span className="text-lg font-bold text-gray-900 leading-none">
                  {countdown}
                </span>
              )}
              {phase === "done" && (
                <span className="text-white text-base leading-none select-none">✓</span>
              )}
              {phase === "failed" && (
                <span className="text-white text-lg font-bold leading-none select-none">!</span>
              )}
            </div>
          </div>

        </div>
      </div>

      {/* ── Instruction card ── */}
      {/*
        When the dot is at the bottom (step 3), the card flips to the top so
        there is always a clear half-screen gap between card and dot.
      */}
      <div
        className={`absolute inset-x-0 flex justify-center pointer-events-none ${
          cardAtBottom ? "bottom-16" : "top-14"
        }`}
      >
        <div className="bg-gray-800/90 backdrop-blur-sm rounded-2xl px-6 py-4 text-center max-w-xs shadow-xl pointer-events-auto">
          {phase === "failed" ? (
            <>
              <p className="text-white font-semibold text-base mb-1">
                Let’s try that again
              </p>
              <p className="text-gray-400 text-sm leading-snug mb-3">
                {failReason ||
                  "Make sure your face is well-lit and centered, then retry."}
              </p>
              <button
                className="bg-indigo-600 hover:bg-indigo-500 rounded px-4 py-1.5 text-sm font-medium"
                onClick={retry}
              >
                {failModeRef.current === "all" ? "Restart calibration" : "Retry"}
              </button>
            </>
          ) : (
            <>
              <p className="text-white font-semibold text-base mb-1">
                Look at the <span className="text-green-400">{step.label}</span> dot
              </p>
              <p className="text-gray-400 text-sm leading-snug">
                {phase === "countdown"
                  ? `Starting in ${countdown}…`
                  : phase === "collecting"
                  ? "Hold still while the ring fills"
                  : "Captured!"}
              </p>
              {framingProblem && (
                <p className="mt-2 flex items-center justify-center gap-1.5 text-amber-400 text-xs font-semibold leading-snug">
                  <svg viewBox="0 0 24 24" width="13" height="13" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" className="flex-shrink-0">
                    <path d="M12 9v4" />
                    <path d="M12 17h.01" />
                    <path d="M10.29 3.86 1.82 18a2 2 0 0 0 1.71 3h16.94a2 2 0 0 0 1.71-3L13.71 3.86a2 2 0 0 0-3.42 0z" />
                  </svg>
                  {framingMessage}
                </p>
              )}
            </>
          )}
        </div>
      </div>

      {/* Cancel */}
      <button
        className="absolute bottom-5 inset-x-0 text-center text-xs text-gray-600 hover:text-gray-400 underline"
        onClick={onCancel}
      >
        Cancel calibration
      </button>

    </div>
  );
}
