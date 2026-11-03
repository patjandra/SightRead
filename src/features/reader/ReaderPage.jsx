import React, { useState, useRef, useEffect, useCallback } from "react";
import { useGazeTracking } from "./hooks/useGazeTracking.js";
import { useScrollControl } from "./hooks/useScrollControl.js";
import { useLocalProfiles } from "./hooks/useLocalProfiles.js";
import { mapRawToCalibratedY, isProfileCalibrated } from "./gaze/calibrationManager.js";
import { usePdfLibrary } from "../library/usePdfLibrary.js";
import PDFViewer from "./components/PDFViewer.jsx";
import CalibrationScreen from "./components/CalibrationScreen.jsx";
import ControlPanel from "./components/ControlPanel.jsx";
import TrackingWarning from "./components/TrackingWarning.jsx";
import UploadLocalProfilesDialog from "./components/UploadLocalProfilesDialog.jsx";
import { useOnSignOut } from "../auth/useOnSignOut.js";
import { useAuth } from "../auth/useAuth.js";

const ZOOM_MIN = 0.5;
const ZOOM_MAX = 3.0;
const ZOOM_STEP = 0.15;

export default function ReaderPage() {
  // ── Panel toggle ───────────────────────────────────────────────────────────
  const [panelOpen, setPanelOpen] = useState(true);

  // ── PDF ────────────────────────────────────────────────────────────────────
  const [pdfUrl, setPdfUrl] = useState(null);
  const prevPdfUrlRef = useRef(null);

  // What is open: the file, and the library id once it is saved to the account.
  const [currentPdf, setCurrentPdf] = useState(null);

  const showPdf = useCallback((file, meta) => {
    if (prevPdfUrlRef.current) URL.revokeObjectURL(prevPdfUrlRef.current);
    const url = URL.createObjectURL(file);
    prevPdfUrlRef.current = url;
    setPdfUrl(url);
    setCurrentPdf({ file, ...meta });
  }, []);

  const handlePdfUpload = useCallback(
    (file) => showPdf(file, { name: file.name, savedId: null }),
    [showPdf]
  );

  useEffect(() => {
    return () => {
      if (prevPdfUrlRef.current) URL.revokeObjectURL(prevPdfUrlRef.current);
    };
  }, []);

  // ── Zoom ───────────────────────────────────────────────────────────────────
  const [zoom, setZoom] = useState(1.0);
  const zoomIn  = () => setZoom((z) => Math.min(ZOOM_MAX, parseFloat((z + ZOOM_STEP).toFixed(2))));
  const zoomOut = () => setZoom((z) => Math.max(ZOOM_MIN, parseFloat((z - ZOOM_STEP).toFixed(2))));

  const {
    user,
    status: authStatus,
    sessionUnknown,
    refresh: refreshAuth,
    requireAuth,
  } = useAuth();

  // ── Profiles ───────────────────────────────────────────────────────────────
  const {
    profiles,
    selectedId,
    selectedProfile,
    selectProfile,
    addProfile,
    updateSelectedProfile,
    removeProfile,
    syncStatus,
    pendingCount,
    saveToAccount,
    uploadOffer,
    confirmUploadOffer,
    dismissUploadOffer,
    retrySync,
  } = useLocalProfiles({
    user,
    authStatus,
    sessionUnknown,
    onUnauthorized: refreshAuth,
  });

  // ── PDF library ────────────────────────────────────────────────────────────
  const library = usePdfLibrary({ user, authStatus, sessionUnknown, onUnauthorized: refreshAuth });

  // A PDF deleted from another device is no longer "saved", even if still open here.
  const openSavedId =
    currentPdf?.savedId && library.pdfs.some((p) => p.id === currentPdf.savedId)
      ? currentPdf.savedId
      : null;

  // Same save gate as profiles: guests sign in first, then the open PDF uploads.
  const handleSavePdf = useCallback(() => {
    if (!currentPdf || openSavedId) return;
    const { file } = currentPdf;
    requireAuth(async (accountUser) => {
      try {
        const saved = await library.save(file, accountUser);
        setCurrentPdf((cur) => (cur?.file === file ? { ...cur, savedId: saved.id } : cur));
      } catch {
        // library.error already holds the message for the panel
      }
    });
  }, [currentPdf, openSavedId, requireAuth, library.save]);

  const handleOpenSaved = useCallback(
    async (pdf) => {
      try {
        showPdf(await library.open(pdf.id), { name: pdf.name, savedId: pdf.id });
      } catch {
        // library.error already holds the message for the panel
      }
    },
    [library.open, showPdf]
  );

  const handleDeleteSaved = useCallback(
    async (pdf) => {
      await library.remove(pdf.id);
      // The file stays open, but it is no longer in the account.
      setCurrentPdf((cur) => (cur?.savedId === pdf.id ? { ...cur, savedId: null } : cur));
    },
    [library.remove]
  );

  // The save gate: guests are asked to sign in first, then the profile uploads
  // (with the freshly signed-in user, since our own auth state is one step behind).
  const handleSaveProfileToAccount = useCallback(
    (id) => requireAuth((accountUser) => saveToAccount(id, accountUser)),
    [requireAuth, saveToAccount]
  );

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
    landmarksRef,
  } = useGazeTracking();

  const [isTracking, setIsTracking] = useState(false);

  // Signing out closes the open PDF (and stops tracking, which has nothing left
  // to scroll), so nothing from the account's session lingers on screen.
  useOnSignOut(
    useCallback(() => {
      setIsTracking(false);
      if (prevPdfUrlRef.current) URL.revokeObjectURL(prevPdfUrlRef.current);
      prevPdfUrlRef.current = null;
      setPdfUrl(null);
      setCurrentPdf(null);
    }, [])
  );

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
  // Tracking is "bad" whenever there's no usable gaze (no face, poor framing,
  // blink, etc.). We debounce showing the warning so transient drops like blinks
  // don't flash it, while sustained problems (off-center, too far) surface with
  // the estimator's actionable hint.
  const trackingBad =
    isTracking &&
    (!gazeData.hasFace || gazeData.confidence < CONFIDENCE_THRESHOLD);

  const [showWarning, setShowWarning] = useState(false);
  const warningTimerRef = useRef(null);

  useEffect(() => {
    if (trackingBad) {
      if (!warningTimerRef.current) {
        warningTimerRef.current = setTimeout(() => setShowWarning(true), 600);
      }
    } else {
      clearTimeout(warningTimerRef.current);
      warningTimerRef.current = null;
      setShowWarning(false);
    }
    return () => clearTimeout(warningTimerRef.current);
  }, [trackingBad]);

  // The specific reason to show once the warning is visible (framing hint, or a
  // generic fallback for a plain lost-face).
  const warningMessage = gazeData.hint || "Tracking lost. Recenter your face.";

  // Face is well-framed when there's no actionable hint (framing / no-face).
  const framingOk = !gazeData.hint;

  // ── Debug values ───────────────────────────────────────────────────────────
  const confidentGaze =
    gazeData.hasFace && gazeData.confidence >= CONFIDENCE_THRESHOLD;

  const debugRawY = gazeData.hasFace ? gazeData.rawY : null;
  // Only map a real, confident reading. Without one, rest at neutral (0.5)
  // instead of mapping the placeholder rawY, which can land in the "up" band
  // depending on calibration — matching the scroll controller, which pauses
  // (neutral) whenever the gaze isn't confident.
  const debugCalibratedY = !isProfileCalibrated(selectedProfile)
    ? null
    : confidentGaze
    ? mapRawToCalibratedY(gazeData.rawY, selectedProfile)
    : 0.5;

  return (
    <div className="h-screen flex flex-col bg-slate-900 overflow-hidden">
      {/* Hidden video for webcam */}
      <video
        ref={videoRef}
        className="absolute opacity-0 pointer-events-none"
        style={{ width: 1, height: 1 }}
        autoPlay
        muted
        playsInline
      />

      <TrackingWarning show={showWarning} message={warningMessage} />

      {uploadOffer && user && (
        <UploadLocalProfilesDialog
          profiles={uploadOffer}
          onConfirm={(ids) => confirmUploadOffer(ids, user)}
          onSkip={dismissUploadOffer}
        />
      )}

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
          library={{
            signedIn: !!user,
            showList: library.showList,
            pdfs: library.pdfs,
            offlineCount: library.offlineCount,
            offlineBytes: library.offlineBytes,
            onClearOffline: library.clearOffline,
            usedBytes: library.usedBytes,
            limitBytes: library.limitBytes,
            error: library.error,
            busy: library.busy,
            canSave: !!currentPdf && !openSavedId,
            activeId: openSavedId,
            onSave: handleSavePdf,
            onOpen: handleOpenSaved,
            onDelete: handleDeleteSaved,
          }}
          profiles={profiles}
          selectedId={selectedId}
          selectedProfile={selectedProfile}
          onSelectProfile={selectProfile}
          onDeleteProfile={removeProfile}
          onCreateProfile={handleCreateProfile}
          syncStatus={syncStatus}
          pendingCount={pendingCount}
          onSaveProfileToAccount={handleSaveProfileToAccount}
          onRetrySync={retrySync}
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
          landmarksRef={landmarksRef}
          framingOk={framingOk}
        />

        <PDFViewer
          pdfUrl={pdfUrl}
          zoom={zoom}
          scrollContainerRef={scrollContainerRef}
          onPdfUpload={handlePdfUpload}
        />
      </div>
    </div>
  );
}
