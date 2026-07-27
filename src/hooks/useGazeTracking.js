import { useState, useEffect, useRef, useCallback } from "react";
import { FaceLandmarker, FilesetResolver } from "@mediapipe/tasks-vision";
import { estimateGaze } from "../gaze/gazeEstimator.js";

const CONFIDENCE_THRESHOLD = 0.5;

/**
 * Manages the MediaPipe FaceLandmarker, webcam stream, and per-frame gaze
 * estimation. The caller is responsible for deciding whether to use the
 * emitted gaze values (e.g. checking if tracking is enabled).
 *
 * @returns {{
 *   gazeData: { rawY: number, confidence: number, hasFace: boolean },
 *   isReady: boolean,
 *   error: string|null,
 *   videoRef: React.RefObject,
 *   startTracking: () => Promise<void>,
 *   stopTracking: () => void,
 * }}
 */
export function useGazeTracking() {
  const [gazeData, setGazeData] = useState({
    rawY: 0.5,
    confidence: 0,
    hasFace: false,
  });
  const [isReady, setIsReady] = useState(false);
  const [error, setError] = useState(null);

  const videoRef = useRef(null);
  const landmarkerRef = useRef(null);
  const streamRef = useRef(null);
  const rafRef = useRef(null);
  const runningRef = useRef(false);

  // Initialize MediaPipe on mount
  useEffect(() => {
    let cancelled = false;

    async function init() {
      try {
        // WASM files are copied into public/mediapipe-wasm by the Vite plugin,
        // so they're served locally — no CDN, no COEP issues, version always matches.
        const vision = await FilesetResolver.forVisionTasks("/mediapipe-wasm");

        if (cancelled) return;

        // CPU delegate works on every machine; GPU can silently fail on some
        // browsers/GPUs and offers no meaningful speed benefit for a single face.
        const landmarker = await FaceLandmarker.createFromOptions(vision, {
          baseOptions: {
            modelAssetPath:
              "https://storage.googleapis.com/mediapipe-models/face_landmarker/face_landmarker/float16/1/face_landmarker.task",
            delegate: "CPU",
          },
          runningMode: "VIDEO",
          numFaces: 1,
          // Blendshapes give us eyeLookUp/Down/In/Out coefficients that model
          // eyeball rotation relative to the head — the signal the gaze
          // estimator uses so that head movement doesn't masquerade as gaze.
          outputFaceBlendshapes: true,
          outputFacialTransformationMatrixes: false,
        });

        if (cancelled) {
          landmarker.close();
          return;
        }

        landmarkerRef.current = landmarker;
        setIsReady(true);
      } catch (err) {
        if (!cancelled) {
          setError("MediaPipe failed to initialize: " + err.message);
        }
      }
    }

    init();

    return () => {
      cancelled = true;
    };
  }, []);

  // Cleanup on unmount
  useEffect(() => {
    return () => {
      stopTracking();
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const stopTracking = useCallback(() => {
    runningRef.current = false;

    if (rafRef.current) {
      cancelAnimationFrame(rafRef.current);
      rafRef.current = null;
    }

    if (streamRef.current) {
      streamRef.current.getTracks().forEach((t) => t.stop());
      streamRef.current = null;
    }

    if (videoRef.current) {
      videoRef.current.srcObject = null;
    }

    setGazeData({ rawY: 0.5, confidence: 0, hasFace: false });
  }, []);

  const startTracking = useCallback(async () => {
    if (!landmarkerRef.current) {
      setError("MediaPipe not ready yet.");
      return;
    }

    // Avoid duplicate streams
    if (streamRef.current) return;

    setError(null);

    let stream;
    try {
      stream = await navigator.mediaDevices.getUserMedia({ video: true });
    } catch (err) {
      setError(
        "Webcam access denied. Please allow camera access and try again."
      );
      return;
    }

    streamRef.current = stream;

    const video = videoRef.current;
    if (!video) {
      stream.getTracks().forEach((t) => t.stop());
      streamRef.current = null;
      return;
    }

    video.srcObject = stream;
    await new Promise((resolve) => {
      video.onloadedmetadata = () => {
        video.play().then(resolve).catch(resolve);
      };
    });

    runningRef.current = true;

    function detect() {
      if (!runningRef.current) return;

      if (
        video.readyState >= HTMLMediaElement.HAVE_CURRENT_DATA &&
        landmarkerRef.current
      ) {
        try {
          const result = landmarkerRef.current.detectForVideo(
            video,
            performance.now()
          );
          const gaze = estimateGaze(result);
          setGazeData(gaze);
        } catch (err) {
          console.warn("[SightRead] detectForVideo error:", err.message);
        }
      }

      rafRef.current = requestAnimationFrame(detect);
    }

    rafRef.current = requestAnimationFrame(detect);
  }, []);

  return {
    gazeData,
    isReady,
    error,
    videoRef,
    startTracking,
    stopTracking,
    CONFIDENCE_THRESHOLD,
  };
}
