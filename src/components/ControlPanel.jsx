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
    : selectedProfile
    ? `Recalibrate "${selectedProfile.name}"`
    : "Calibrate";

  // Collapsed view — just a thin tab with a toggle arrow
  if (!panelOpen) {
    return (
      <div className="w-8 flex-shrink-0 bg-gray-800 flex flex-col items-center pt-3 gap-3 border-r border-gray-700">
        <button
          onClick={onTogglePanel}
          className="text-gray-400 hover:text-white flex items-center justify-center"
          title="Expand panel"
          aria-label="Expand panel"
        >
          <HamburgerIcon />
        </button>
        <span
          className="text-gray-600 text-xs font-bold select-none"
          style={{ writingMode: "vertical-rl", letterSpacing: "0.1em" }}
        >
          SR
        </span>
      </div>
    );
  }

  return (
    <aside className="w-56 flex-shrink-0 bg-gray-800 text-white flex flex-col gap-4 p-3 overflow-y-auto text-sm border-r border-gray-700">

      {/* Header with collapse toggle */}
      <div className="flex items-start justify-between">
        <div>
          <h1 className="text-lg font-bold tracking-tight">SightRead</h1>
          <p className="text-xs text-gray-400">Gaze-based sheet music scroller</p>
        </div>
        <button
          onClick={onTogglePanel}
          className="text-gray-500 hover:text-white mt-1 ml-1 flex-shrink-0 flex items-center justify-center"
          title="Collapse panel"
          aria-label="Collapse panel"
        >
          <HamburgerIcon />
        </button>
      </div>

      {/* PDF Upload */}
      <section>
        <p className="text-xs font-semibold uppercase text-gray-400 mb-1">PDF</p>
        <button
          className="w-full text-left bg-gray-700 hover:bg-gray-600 border border-gray-600 rounded px-2 py-1 text-sm truncate"
          onClick={() => fileInputRef.current?.click()}
        >
          {hasPdf ? "Change PDF" : "Upload PDF"}
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
      <section>
        {mediapipeError ? (
          <>
            <p className="text-xs font-semibold uppercase text-gray-400 mb-1">Camera</p>
            <p className="text-xs text-red-400">{mediapipeError}</p>
          </>
        ) : mediapipeReady ? (
          <div className="flex items-center justify-between gap-2">
            <p className="text-xs font-semibold uppercase text-gray-400">Camera</p>
            <span
              className={`inline-flex items-center gap-1.5 rounded-md px-2 py-0.5 text-xs font-semibold border ${
                cameraActive
                  ? "bg-green-500/15 border-green-500/40 text-green-400"
                  : "bg-red-500/15 border-red-500/40 text-red-400"
              }`}
            >
              <span
                className={`w-1.5 h-1.5 rounded-full ${
                  cameraActive ? "bg-green-400" : "bg-red-400"
                }`}
              />
              {cameraActive ? "On" : "Off"}
            </span>
          </div>
        ) : (
          <>
            <p className="text-xs font-semibold uppercase text-gray-400 mb-1">Camera</p>
            <p className="text-xs text-yellow-400">Loading model…</p>
          </>
        )}
      </section>

      {/* Profile selector */}
      <section>
        <p className="text-xs font-semibold uppercase text-gray-400 mb-1">Profile</p>
        <ProfileSelector
          profiles={profiles}
          selectedId={selectedId}
          onSelect={onSelectProfile}
          onDelete={onDeleteProfile}
          onCreate={onCreateProfile}
        />
        {selectedProfile && isCalibrationStale(selectedProfile) && (
          <p className="text-xs text-yellow-400 mt-1">
            Calibration is out of date — recalibrate below.
          </p>
        )}
        {selectedProfile && !selectedProfile.points && (
          <p className="text-xs text-yellow-400 mt-1">
            No calibration yet — click Calibrate below.
          </p>
        )}
      </section>

      {/* Calibration */}
      <section>
        <button
          className="w-full bg-indigo-600 hover:bg-indigo-500 disabled:opacity-40 rounded px-2 py-1 text-sm font-medium"
          onClick={onStartCalibration}
          disabled={!mediapipeReady || isCalibrating || !selectedProfile}
        >
          {calibrateLabel}
        </button>
        {!selectedProfile && (
          <p className="text-xs text-gray-500 mt-1">Select or create a profile first.</p>
        )}
      </section>

      {/* Tracking */}
      <section>
        <button
          className={`w-full rounded px-2 py-1 text-sm font-medium disabled:opacity-40 ${
            isTracking
              ? "bg-red-600 hover:bg-red-500"
              : "bg-green-600 hover:bg-green-500"
          }`}
          onClick={onToggleTracking}
          disabled={!trackingReady}
        >
          {isTracking ? "Pause Tracking" : "Start Tracking"}
        </button>
        {!trackingReady && (
          <p className="text-xs text-gray-500 mt-1">
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
      <section>
        <label className="text-xs font-semibold uppercase text-gray-400 mb-1 block">
          Sensitivity: {sensitivity.toFixed(2)}
        </label>
        <input
          type="range"
          min="0"
          max="1"
          step="0.01"
          value={sensitivityToSlider(sensitivity)}
          onChange={(e) => onSensitivityChange(sliderToSensitivity(parseFloat(e.target.value)))}
          className="w-full accent-indigo-500"
        />
        <div className="flex justify-between text-xs text-gray-600 mt-0.5">
          <span>0.10</span>
          <span className="text-gray-500">0.40</span>
          <span>1.60</span>
        </div>
      </section>

      {/* Zoom */}
      <section>
        <p className="text-xs font-semibold uppercase text-gray-400 mb-1">
          Zoom: {Math.round(zoom * 100)}%
        </p>
        <div className="flex gap-1">
          <button
            className="flex-1 bg-gray-700 hover:bg-gray-600 rounded py-1 text-sm"
            onClick={onZoomOut}
          >
            −
          </button>
          <button
            className="flex-1 bg-gray-700 hover:bg-gray-600 rounded py-1 text-sm"
            onClick={onZoomIn}
          >
            +
          </button>
        </div>
      </section>

      {/* Face preview — shows what the camera sees and how you're framed */}
      <section>
        <div className="flex items-center justify-between mb-1">
          <p className="text-xs font-semibold uppercase text-gray-400">
            Face view
          </p>
          <button
            onClick={() => setShowFaceView((v) => !v)}
            role="switch"
            aria-checked={showFaceView}
            title={showFaceView ? "Hide face view" : "Show face view"}
            className={`relative w-9 h-5 rounded-full transition-colors ${
              showFaceView ? "bg-green-600" : "bg-gray-600"
            }`}
          >
            <span
              className={`absolute top-0.5 left-0.5 w-4 h-4 rounded-full bg-white transition-transform ${
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
            <p className="text-xs text-gray-600 mt-1">
              Keep your face inside the guide.
            </p>
          </>
        )}
      </section>

      {/* Debug */}
      <section className="mt-auto border-t border-gray-700 pt-2">
        <p className="text-xs font-semibold uppercase text-gray-500 mb-1">Debug</p>
        <p className="text-xs text-gray-400">
          rawY:{" "}
          <span className="text-gray-200">
            {debugRawY !== null ? debugRawY.toFixed(3) : "—"}
          </span>
        </p>
        <p className="text-xs text-gray-400">
          calibY:{" "}
          <span className="text-gray-200">
            {debugCalibratedY !== null ? debugCalibratedY.toFixed(3) : "—"}
          </span>
        </p>
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
              ? "text-gray-200"
              : zone === "• neutral"
              ? "text-green-400"
              : "text-yellow-400";
          return (
            <p className="text-xs text-gray-400">
              zone: <span className={color}>{zone ?? "—"}</span>
            </p>
          );
        })()}
      </section>
    </aside>
  );
}
