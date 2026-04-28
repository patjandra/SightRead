import React, { useRef } from "react";
import ProfileSelector from "./ProfileSelector.jsx";

// Log-scale mapping so that 0.40 sits exactly at the slider midpoint (0.5).
// Range: slider 0 → sens 0.10,  slider 0.5 → sens 0.40,  slider 1 → sens 1.60
const LOG_RANGE = Math.log(1.60 / 0.10); // total log span ≈ 2.773

function sliderToSensitivity(v) {
  return 0.10 * Math.exp(LOG_RANGE * v);
}

function sensitivityToSlider(s) {
  return Math.log(s / 0.10) / LOG_RANGE;
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
  onStartCamera,
  onStopCamera,
}) {
  const fileInputRef = useRef(null);

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
          className="text-gray-400 hover:text-white text-xs px-1"
          title="Expand panel"
        >
          ▶
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
          className="text-gray-500 hover:text-white text-xs mt-1 ml-1 flex-shrink-0"
          title="Collapse panel"
        >
          ◀
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
        <p className="text-xs font-semibold uppercase text-gray-400 mb-1">Camera</p>
        {mediapipeError ? (
          <p className="text-xs text-red-400">{mediapipeError}</p>
        ) : mediapipeReady ? (
          <div className="flex items-center justify-between gap-2">
            <p className={`text-xs ${cameraActive ? "text-green-400" : "text-gray-500"}`}>
              {cameraActive ? "On" : "Off"}
            </p>
            {cameraActive ? (
              <button
                className="text-xs text-gray-500 hover:text-red-400 underline"
                onClick={onStopCamera}
              >
                Turn off
              </button>
            ) : (
              <button
                className="text-xs text-gray-500 hover:text-green-400 underline"
                onClick={onStartCamera}
              >
                Turn on
              </button>
            )}
          </div>
        ) : (
          <p className="text-xs text-yellow-400">Loading model…</p>
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
              : !selectedProfile.points
              ? "Calibrate the profile first."
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
      </section>
    </aside>
  );
}
