import React, { useRef, useState } from "react";
import ProfileSelector from "./ProfileSelector.jsx";
import FacePreview from "./FacePreview.jsx";
import { SCROLL_UP_THRESHOLD, SCROLL_DOWN_THRESHOLD } from "../config.js";
import {
  isProfileCalibrated,
  isCalibrationStale,
} from "../gaze/calibrationManager.js";

// Log-scale mapping so that 0.40 sits exactly at the slider midpoint (0.5).
// Range: slider 0 → sens 0.10,  slider 0.5 → sens 0.40,  slider 1 → sens 1.60
const LOG_RANGE = Math.log(1.60 / 0.10); // total log span ≈ 2.773

function sliderToSensitivity(v) {
  return 0.10 * Math.exp(LOG_RANGE * v);
}

function sensitivityToSlider(s) {
  return Math.log(s / 0.10) / LOG_RANGE;
}

function HamburgerIcon({ size = 18 }) {
  return (
    <svg
      viewBox="0 0 24 24"
      width={size}
      height={size}
      fill="none"
      stroke="currentColor"
      strokeWidth="2"
      strokeLinecap="round"
      aria-hidden="true"
    >
      <line x1="4" y1="7" x2="20" y2="7" />
      <line x1="4" y1="12" x2="20" y2="12" />
      <line x1="4" y1="17" x2="20" y2="17" />
    </svg>
  );
}

// Small, consistent section heading used throughout the panel.
function SectionLabel({ children, className = "" }) {
  return (
    <p
      className={`text-[11px] font-semibold uppercase tracking-wider text-slate-400 ${className}`}
    >
      {children}
    </p>
  );
}

export default function ControlPanel({
  // Panel toggle
  panelOpen,
  onTogglePanel,
  // PDF
  onPdfUpload,
  hasPdf,
  // Profiles
  profiles,
  selectedId,
  selectedProfile,
  onSelectProfile,
  onDeleteProfile,
  onCreateProfile,
  // Calibration
  onStartCalibration,
  isCalibrating,
  // Tracking
  isTracking,
  onToggleTracking,
  trackingReady,
  // Sensitivity
  sensitivity,
  onSensitivityChange,
  // Zoom
  onZoomIn,
  onZoomOut,
  zoom,
  // Debug
  debugRawY,
  debugCalibratedY,
  // Mediapipe
  mediapipeReady,
  mediapipeError,
  cameraActive,
  landmarksRef,
  framingOk,
}) {
  const fileInputRef = useRef(null);
  const [showFaceView, setShowFaceView] = useState(true);

  function handleFileChange(e) {
    const file = e.target.files?.[0];
    if (file) onPdfUpload(file);
    e.target.value = "";
  }

  const calibrateLabel = isCalibrating
    ? "Calibrating…"
    : !selectedProfile
    ? "Calibrate"
    : selectedProfile.points
    ? `Recalibrate "${selectedProfile.name}"`
    : `Calibrate "${selectedProfile.name}"`;

  // Collapsed view — a slim rail with the logo and a menu button.
  if (!panelOpen) {
    return (
      <div className="w-12 flex-shrink-0 bg-slate-800 flex flex-col items-center pt-3 gap-4 border-r border-slate-700">
        <button
          onClick={onTogglePanel}
          className="text-slate-400 hover:text-white p-1.5 rounded-md hover:bg-slate-700 transition-colors"
          title="Expand panel"
          aria-label="Expand panel"
        >
          <HamburgerIcon />
        </button>
        <img
          src="/sight-read-logo.png"
          alt="SightRead"
          className="w-7 h-7 rounded-md opacity-90"
        />
      </div>
    );
  }

  return (
    <aside className="sr-scroll w-64 flex-shrink-0 bg-slate-800 text-slate-100 flex flex-col gap-3 px-3 py-3 overflow-y-auto text-sm border-r border-slate-700">

      {/* Header */}
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2.5 min-w-0">
          <img
            src="/sight-read-logo.png"
            alt=""
            className="w-8 h-8 rounded-md flex-shrink-0"
          />
          <div className="min-w-0">
            <h1 className="text-base font-bold tracking-tight leading-tight">
              SightRead
            </h1>
            <p className="text-[11px] text-slate-500 leading-tight truncate">
              Gaze sheet-music scroller
            </p>
          </div>
        </div>
        <button
          onClick={onTogglePanel}
          className="text-slate-400 hover:text-white p-1.5 -mr-1 rounded-md hover:bg-slate-700 transition-colors flex-shrink-0"
          title="Collapse panel"
          aria-label="Collapse panel"
        >
          <HamburgerIcon />
        </button>
      </div>

      {/* PDF Upload */}
      <section className="space-y-1.5">
        <SectionLabel>Sheet music</SectionLabel>
        <button
          className="w-full flex items-center gap-2 bg-slate-700 hover:bg-slate-600 border border-slate-600 rounded-lg px-3 py-2 text-sm transition-colors focus:outline-none focus:ring-2 focus:ring-indigo-500/50"
          onClick={() => fileInputRef.current?.click()}
        >
          <svg viewBox="0 0 24 24" width="15" height="15" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className="text-slate-400">
            <path d="M12 3v12" />
            <path d="m7 8 5-5 5 5" />
            <path d="M5 21h14" />
          </svg>
          <span className="truncate">{hasPdf ? "Change PDF" : "Upload PDF"}</span>
        </button>
        <input
          ref={fileInputRef}
          type="file"
          accept="application/pdf"
          className="hidden"
          onChange={handleFileChange}
        />
      </section>

      {/* Camera status */}
      <section className="flex items-center justify-between">
        <SectionLabel>Camera</SectionLabel>
        {mediapipeError ? (
          <span className="text-xs text-red-400 text-right">Error</span>
        ) : mediapipeReady ? (
          <span
            className={`inline-flex items-center gap-1.5 rounded-full px-2.5 py-0.5 text-xs font-semibold border ${
              cameraActive
                ? "bg-emerald-500/10 border-emerald-500/40 text-emerald-400"
                : "bg-slate-700/40 border-slate-600 text-slate-400"
            }`}
          >
            <span
              className={`w-1.5 h-1.5 rounded-full ${
                cameraActive ? "bg-emerald-400" : "bg-slate-500"
              }`}
            />
            {cameraActive ? "On" : "Off"}
          </span>
        ) : (
          <span className="text-xs text-amber-400">Loading model…</span>
        )}
      </section>
      {mediapipeError && (
        <p className="-mt-2 text-xs text-red-400/90 leading-snug">{mediapipeError}</p>
      )}

      {/* Profile selector */}
      <section className="space-y-1.5">
        <SectionLabel>Profile</SectionLabel>
        <ProfileSelector
          profiles={profiles}
          selectedId={selectedId}
          onSelect={onSelectProfile}
          onDelete={onDeleteProfile}
          onCreate={onCreateProfile}
        />
        {selectedProfile && isCalibrationStale(selectedProfile) && (
          <p className="text-xs text-amber-400">
            Calibration out of date — recalibrate below.
          </p>
        )}
        {selectedProfile && !selectedProfile.points && (
          <p className="text-xs text-amber-400">
            Not calibrated yet — click Calibrate.
          </p>
        )}
      </section>

      {/* Calibration */}
      <section>
        <button
          className="w-full bg-indigo-600 hover:bg-indigo-500 disabled:opacity-40 disabled:hover:bg-indigo-600 rounded-lg px-3 py-2 text-sm font-semibold transition-colors focus:outline-none focus:ring-2 focus:ring-indigo-500/50"
          onClick={onStartCalibration}
          disabled={!mediapipeReady || isCalibrating || !selectedProfile}
        >
          {calibrateLabel}
        </button>
        {!selectedProfile && (
          <p className="text-xs text-slate-500 mt-1.5">Select or create a profile first.</p>
        )}
      </section>

      {/* Tracking */}
      <section>
        <button
          className={`w-full rounded-lg px-3 py-2 text-sm font-semibold transition-colors disabled:opacity-40 focus:outline-none focus:ring-2 ${
            isTracking
              ? "bg-red-600 hover:bg-red-500 focus:ring-red-500/50 disabled:hover:bg-red-600"
              : "bg-emerald-600 hover:bg-emerald-500 focus:ring-emerald-500/50 disabled:hover:bg-emerald-600"
          }`}
          onClick={onToggleTracking}
          disabled={!trackingReady}
        >
          {isTracking ? "Pause tracking" : "Start tracking"}
        </button>
        {!trackingReady && (
          <p className="text-xs text-slate-500 mt-1.5">
            {!mediapipeReady
              ? "Waiting for model…"
              : !selectedProfile
              ? "Select a profile first."
              : isCalibrationStale(selectedProfile)
              ? "Recalibrate the profile first."
              : !isProfileCalibrated(selectedProfile)
              ? "Calibrate the profile first."
              : !hasPdf
              ? "Upload a PDF first."
              : ""}
          </p>
        )}
      </section>

      {/* Sensitivity */}
      <section className="space-y-2">
        <div className="flex items-center justify-between">
          <SectionLabel>Sensitivity</SectionLabel>
          <span className="text-xs font-mono text-slate-300 tabular-nums">
            {sensitivity.toFixed(2)}
          </span>
        </div>
        <input
          type="range"
          min="0"
          max="1"
          step="0.01"
          value={sensitivityToSlider(sensitivity)}
          onChange={(e) => onSensitivityChange(sliderToSensitivity(parseFloat(e.target.value)))}
          className="w-full accent-indigo-500 cursor-pointer"
        />
        <div className="flex justify-between text-[10px] text-slate-600">
          <span>0.10</span>
          <span>0.40</span>
          <span>1.60</span>
        </div>
      </section>

      {/* Zoom */}
      <section className="space-y-1.5">
        <div className="flex items-center justify-between">
          <SectionLabel>Zoom</SectionLabel>
          <span className="text-xs font-mono text-slate-300 tabular-nums">
            {Math.round(zoom * 100)}%
          </span>
        </div>
        <div className="flex items-center rounded-lg border border-slate-600 overflow-hidden">
          <button
            className="flex-1 bg-slate-700 hover:bg-slate-600 py-1.5 text-base leading-none transition-colors focus:outline-none focus:bg-slate-600"
            onClick={onZoomOut}
            aria-label="Zoom out"
          >
            −
          </button>
          <div className="w-px self-stretch bg-slate-600" />
          <button
            className="flex-1 bg-slate-700 hover:bg-slate-600 py-1.5 text-base leading-none transition-colors focus:outline-none focus:bg-slate-600"
            onClick={onZoomIn}
            aria-label="Zoom in"
          >
            +
          </button>
        </div>
      </section>

      {/* Face preview — shows what the camera sees and how you're framed */}
      <section className="space-y-1.5">
        <div className="flex items-center justify-between">
          <SectionLabel>Face view</SectionLabel>
          <button
            onClick={() => setShowFaceView((v) => !v)}
            role="switch"
            aria-checked={showFaceView}
            title={showFaceView ? "Hide face view" : "Show face view"}
            className={`relative w-9 h-5 rounded-full transition-colors focus:outline-none focus:ring-2 focus:ring-indigo-500/40 ${
              showFaceView ? "bg-indigo-600" : "bg-slate-600"
            }`}
          >
            <span
              className={`absolute top-0.5 left-0.5 w-4 h-4 rounded-full bg-white shadow transition-transform ${
                showFaceView ? "translate-x-4" : "translate-x-0"
              }`}
            />
          </button>
        </div>
        {showFaceView && (
          <>
            <FacePreview
              landmarksRef={landmarksRef}
              active={cameraActive}
              framingOk={framingOk}
            />
            <p className="text-[11px] text-slate-500">
              Keep your face inside the guide.
            </p>
          </>
        )}
      </section>

      {/* Debug */}
      <section className="mt-auto border-t border-slate-700 pt-3">
        <SectionLabel className="mb-1.5">Gaze data</SectionLabel>
        <div className="grid grid-cols-3 gap-2 font-mono text-[11px]">
          <div>
            <div className="text-slate-500">rawY</div>
            <div className="text-slate-200 tabular-nums">
              {debugRawY !== null ? debugRawY.toFixed(3) : "—"}
            </div>
          </div>
          <div>
            <div className="text-slate-500">calibY</div>
            <div className="text-slate-200 tabular-nums">
              {debugCalibratedY !== null ? debugCalibratedY.toFixed(3) : "—"}
            </div>
          </div>
          {(() => {
            // Shared thresholds, so the readout always matches what actually
            // drives scrolling.
            const zone =
              debugCalibratedY === null
                ? null
                : debugCalibratedY < SCROLL_UP_THRESHOLD
                ? "▲ up"
                : debugCalibratedY > SCROLL_DOWN_THRESHOLD
                ? "▼ down"
                : "• neutral";
            const color =
              zone === null
                ? "text-slate-200"
                : zone === "• neutral"
                ? "text-emerald-400"
                : "text-amber-400";
            return (
              <div>
                <div className="text-slate-500">zone</div>
                <div className={color}>{zone ?? "—"}</div>
              </div>
            );
          })()}
        </div>
      </section>
    </aside>
  );
}
