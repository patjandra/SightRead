import React, { useState, useEffect, useRef, useCallback } from "react";

const STEPS = [
  { key: "top",    label: "top",    dotTop: "13%" },
  { key: "center", label: "center", dotTop: "50%" },
  { key: "bottom", label: "bottom", dotTop: "83%" },
];

const COLLECT_MS   = 1200;
const COUNTDOWN_N  = 3;
const COUNTDOWN_MS = 800;

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

  const samplesRef      = useRef([]);
  const timerRef        = useRef(null);
  const collectStartRef = useRef(null);
  const rafRef          = useRef(null);

  const step = STEPS[stepIndex];

  const clearTimers = useCallback(() => {
    clearInterval(timerRef.current);
    cancelAnimationFrame(rafRef.current);
  }, []);

  useEffect(() => {
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

    return clearTimers;
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [stepIndex]);

  function beginCollecting() {
    setPhase("collecting");
    collectStartRef.current = performance.now();
    samplesRef.current = [];

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

  useEffect(() => {
    if (phase !== "collecting") return;
    if (gazeData.confidence >= 0.5 && gazeData.hasFace) {
      samplesRef.current.push(gazeData.rawY);
    }
  }, [gazeData, phase]);

  function finishStep() {
    const samples = samplesRef.current;

    // No valid gaze samples means the face wasn't detected during this step.
    // Accepting it would default to 0.5 and, if it happens on every step,
    // produce a degenerate all-0.5 profile that maps every gaze to "neutral".
    // Surface it and let the user retry this step instead of failing silently.
    if (samples.length === 0) {
      setPhase("failed");
      return;
    }

    const avg = samples.reduce((a, b) => a + b, 0) / samples.length;

    const newPoints = { ...points, [step.key]: avg };
    setPoints(newPoints);
    setPhase("done");

    if (stepIndex < STEPS.length - 1) {
      setTimeout(() => setStepIndex((i) => i + 1), 350);
    } else {
      // Final guard: the top→bottom span must be wide enough to map gaze onto
      // distinct zones. Too small means the readings never separated (e.g. the
      // eyes barely moved or detection was poor) and scrolling would be stuck.
      const span = Math.abs(newPoints.bottom - newPoints.top);
      if (span < 0.04) {
        setPhase("failed");
        return;
      }
      setTimeout(() => onComplete(newPoints), 350);
    }
  }

  // Restart the current step's countdown+collection after a failed capture.
  const retryStep = useCallback(() => {
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
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

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
                Couldn’t read your gaze
              </p>
              <p className="text-gray-400 text-sm leading-snug mb-3">
                Make sure your face is well-lit and centered in the camera, then
                try this step again.
              </p>
              <button
                className="bg-indigo-600 hover:bg-indigo-500 rounded px-4 py-1.5 text-sm font-medium"
                onClick={retryStep}
              >
                Retry
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
