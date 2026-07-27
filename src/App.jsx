import React, { useState, useRef, useEffect, useCallback } from "react";
import { useGazeTracking } from "./hooks/useGazeTracking.js";
import { useScrollControl } from "./hooks/useScrollControl.js";
import { useLocalProfiles } from "./hooks/useLocalProfiles.js";
import { mapRawToCalibratedY, isProfileCalibrated } from "./gaze/calibrationManager.js";
import PDFViewer from "./components/PDFViewer.jsx";
import CalibrationScreen from "./components/CalibrationScreen.jsx";
import ControlPanel from "./components/ControlPanel.jsx";
import TrackingWarning from "./components/TrackingWarning.jsx";

const ZOOM_MIN = 0.5;
const ZOOM_MAX = 3.0;
const ZOOM_STEP = 0.15;

export default function App() {
  // ── Panel toggle ───────────────────────────────────────────────────────────
  const [panelOpen, setPanelOpen] = useState(true);

  // ── PDF ────────────────────────────────────────────────────────────────────
  const [pdfUrl, setPdfUrl] = useState(null);
  const prevPdfUrlRef = useRef(null);

  const handlePdfUpload = useCallback((file) => {
    if (prevPdfUrlRef.current) URL.revokeObjectURL(prevPdfUrlRef.current);
    const url = URL.createObjectURL(file);
    prevPdfUrlRef.current = url;
    setPdfUrl(url);
  }, []);

  useEffect(() => {
    return () => {
      if (prevPdfUrlRef.current) URL.revokeObjectURL(prevPdfUrlRef.current);
    };
  }, []);

  // ── Zoom ───────────────────────────────────────────────────────────────────
  const [zoom, setZoom] = useState(1.0);
  const zoomIn  = () => setZoom((z) => Math.min(ZOOM_MAX, parseFloat((z + ZOOM_STEP).toFixed(2))));
  const zoomOut = () => setZoom((z) => Math.max(ZOOM_MIN, parseFloat((z - ZOOM_STEP).toFixed(2))));

  // ── Profiles ───────────────────────────────────────────────────────────────
  const {
    profiles,
    selectedId,
    selectedProfile,
    selectProfile,
    addProfile,
    updateSelectedProfile,
    removeProfile,
  } = useLocalProfiles();

  // Create a profile with no calibration yet; the user calibrates it separately.
  const handleCreateProfile = useCallback(
    (name) => {
      addProfile(name, null);
    },
    [addProfile]
  );

  // ── Gaze tracking ──────────────────────────────────────────────────────────
  const {
    gazeData,
    isReady: mediapipeReady,
    error: mediapipeError,
    videoRef,
    startTracking: startCamera,
    stopTracking: stopCamera,
    CONFIDENCE_THRESHOLD,
  } = useGazeTracking();

  const [isTracking, setIsTracking] = useState(false);

  // Tracking requires a profile calibrated for the CURRENT algorithm AND an
  // uploaded PDF — there's nothing to scroll until a file is loaded.
  const trackingReady =
    mediapipeReady && isProfileCalibrated(selectedProfile) && !!pdfUrl;

  const handleToggleTracking = useCallback(() => {
    setIsTracking((t) => !t);
  }, []);

  // ── Calibration ────────────────────────────────────────────────────────────
  const [isCalibrating, setIsCalibrating] = useState(false);

  const handleStartCalibration = useCallback(() => {
    if (!selectedProfile) return;
    setIsTracking(false);
    setIsCalibrating(true);
  }, [selectedProfile]);

  // ── Camera lifecycle ─────────────────────────────────────────────────────
  // The webcam is only needed while tracking or calibrating; keep it off
  // otherwise so it isn't running (and its indicator light on) when idle.
  // startCamera/stopCamera are idempotent, so this stays in sync with intent.
  const cameraShouldBeOn = isTracking || isCalibrating;

  useEffect(() => {
    if (cameraShouldBeOn) {
      startCamera();
    } else {
      stopCamera();
    }
  }, [cameraShouldBeOn, startCamera, stopCamera]);

  // Always calibrates the currently selected profile.
  const handleCalibrationComplete = useCallback(
    (points) => {
      setIsCalibrating(false);
      updateSelectedProfile(points);
    },
    [updateSelectedProfile]
  );

  const handleCalibrationCancel = useCallback(() => {
    setIsCalibrating(false);
  }, []);

  // ── Sensitivity ────────────────────────────────────────────────────────────
  const [sensitivity, setSensitivity] = useState(0.4);

  // ── Scroll container ───────────────────────────────────────────────────────
  const scrollContainerRef = useRef(null);

  useScrollControl({
    gazeData,
    selectedProfile,
    isTracking,
    sensitivity,
    confidenceThreshold: CONFIDENCE_THRESHOLD,
    scrollContainerRef,
  });

  // ── Tracking warning ───────────────────────────────────────────────────────
  const showWarning =
    isTracking &&
    (!gazeData.hasFace || gazeData.confidence < CONFIDENCE_THRESHOLD);

  // ── Debug values ───────────────────────────────────────────────────────────
  const debugRawY = gazeData.hasFace ? gazeData.rawY : null;
  const debugCalibratedY = isProfileCalibrated(selectedProfile)
    ? mapRawToCalibratedY(gazeData.rawY, selectedProfile)
    : null;

  return (
    <div className="h-screen flex flex-col bg-gray-900 overflow-hidden">
      {/* Hidden video for webcam */}
      <video
        ref={videoRef}
        className="absolute opacity-0 pointer-events-none"
        style={{ width: 1, height: 1 }}
        autoPlay
        muted
        playsInline
      />

      <TrackingWarning show={showWarning} />

      {isCalibrating && (
        <CalibrationScreen
          gazeData={gazeData}
          onComplete={handleCalibrationComplete}
          onCancel={handleCalibrationCancel}
        />
      )}

      <div className="flex flex-1 min-h-0">
        <ControlPanel
          panelOpen={panelOpen}
          onTogglePanel={() => setPanelOpen((v) => !v)}
          onPdfUpload={handlePdfUpload}
          hasPdf={!!pdfUrl}
          profiles={profiles}
          selectedId={selectedId}
          selectedProfile={selectedProfile}
          onSelectProfile={selectProfile}
          onDeleteProfile={removeProfile}
          onCreateProfile={handleCreateProfile}
          onStartCalibration={handleStartCalibration}
          isCalibrating={isCalibrating}
          isTracking={isTracking}
          onToggleTracking={handleToggleTracking}
          trackingReady={trackingReady}
          sensitivity={sensitivity}
          onSensitivityChange={setSensitivity}
          onZoomIn={zoomIn}
          onZoomOut={zoomOut}
          zoom={zoom}
          debugRawY={debugRawY}
          debugCalibratedY={debugCalibratedY}
          mediapipeReady={mediapipeReady}
          mediapipeError={mediapipeError}
          cameraActive={cameraShouldBeOn}
        />

        <PDFViewer
          pdfUrl={pdfUrl}
          zoom={zoom}
          scrollContainerRef={scrollContainerRef}
        />
      </div>
    </div>
  );
}
