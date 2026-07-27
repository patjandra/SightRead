import React, { useEffect, useRef } from "react";
import { DrawingUtils, FaceLandmarker } from "@mediapipe/tasks-vision";

/**
 * Live face-mesh preview. Renders MediaPipe's 478-point face mesh (the same
 * landmarks the gaze estimator uses) onto a small canvas so the user can see
 * what the camera sees and whether they're framed well for tracking.
 *
 * Draws directly from a ref on its own rAF loop — no React state per frame.
 *
 * Props:
 *   landmarksRef - ref holding the latest faceLandmarks[0] (or null)
 *   active       - whether the camera is running
 *   framingOk    - whether the face is currently well-framed (tints the mesh)
 */
export default function FacePreview({ landmarksRef, active, framingOk = true }) {
  const canvasRef = useRef(null);

  // Mirror framingOk into a ref so the rAF loop reads the latest value without
  // being torn down and rebuilt on every change.
  const framingOkRef = useRef(framingOk);
  framingOkRef.current = framingOk;

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext("2d");
    const drawer = new DrawingUtils(ctx);
    let raf;

    function frame() {
      const W = canvas.width;
      const H = canvas.height;

      // Background
      ctx.fillStyle = "#0b1220";
      ctx.fillRect(0, 0, W, H);

      const lm = active ? landmarksRef.current : null;

      // Centering guide: a dashed oval marking roughly where the face should sit.
      ctx.save();
      ctx.strokeStyle = "rgba(148,163,184,0.35)";
      ctx.setLineDash([4, 4]);
      ctx.lineWidth = 1;
      ctx.beginPath();
      ctx.ellipse(W / 2, H / 2, W * 0.26, H * 0.36, 0, 0, Math.PI * 2);
      ctx.stroke();
      ctx.restore();

      if (lm && lm.length) {
        // Green when well-framed, amber when framing is off — matching the
        // warning banner so the preview itself signals the problem.
        const ok = framingOkRef.current;
        const mesh = ok ? "rgba(74,222,128,0.45)" : "rgba(251,191,36,0.5)";
        const oval = ok ? "rgba(74,222,128,0.9)" : "rgba(251,191,36,0.95)";

        // Mirror horizontally so movement matches the user (selfie view).
        ctx.save();
        ctx.translate(W, 0);
        ctx.scale(-1, 1);
        drawer.drawConnectors(
          lm,
          FaceLandmarker.FACE_LANDMARKS_TESSELATION,
          { color: mesh, lineWidth: 0.6 }
        );
        drawer.drawConnectors(
          lm,
          FaceLandmarker.FACE_LANDMARKS_FACE_OVAL,
          { color: oval, lineWidth: 1.2 }
        );
        ctx.restore();
      } else {
        ctx.fillStyle = "#64748b";
        ctx.font = "11px system-ui, sans-serif";
        ctx.textAlign = "center";
        ctx.textBaseline = "middle";
        ctx.fillText(active ? "Looking for your face…" : "Camera off", W / 2, H / 2);
      }

      raf = requestAnimationFrame(frame);
    }

    raf = requestAnimationFrame(frame);
    return () => cancelAnimationFrame(raf);
  }, [landmarksRef, active]);

  return (
    <canvas
      ref={canvasRef}
      width={220}
      height={165}
      className="w-full rounded border border-gray-700"
    />
  );
}
