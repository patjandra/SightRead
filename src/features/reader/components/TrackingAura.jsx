import React from "react";
import { LEVEL_COLORS } from "../gaze/trackingQuality.js";

// Glow strength per level: a quiet green while all is well, stronger as it worsens.
const ALPHA = { green: 0.16, yellow: 0.3, orange: 0.4, red: 0.5 };

/**
 * Soft colored glow around the edge of the window while tracking, showing how
 * reliable the scrolling is: green is good, then yellow, orange and red as the
 * face drifts out of the camera's sweet spot. Never blocks clicks.
 */
export default function TrackingAura({ level }) {
  if (!level) return null;
  const hex = LEVEL_COLORS[level];
  const alpha = Math.round(ALPHA[level] * 255).toString(16).padStart(2, "0");
  return (
    <div
      aria-hidden="true"
      data-testid="tracking-aura"
      data-level={level}
      className="pointer-events-none fixed inset-0 z-30 transition-[box-shadow] duration-500"
      style={{ boxShadow: `inset 0 0 70px 10px ${hex}${alpha}` }}
    />
  );
}
