import { CALIBRATION_VERSION } from "../../../config.js";

// Profile persistence (create/update/delete, storage) lives in profileStore.js.
// This module holds only the pure, storage-free calibration logic: deciding
// whether a saved profile is usable and mapping a raw gaze value onto the
// screen with its calibration points.

/**
 * Whether a profile is calibrated FOR THE CURRENT gaze algorithm. Points saved
 * under an older CALIBRATION_VERSION are meaningless now, so they count as
 * uncalibrated and the user is prompted to recalibrate.
 *
 * @param {object|null} profile
 * @returns {boolean}
 */
export function isProfileCalibrated(profile) {
  return !!profile?.points && profile.calibrationVersion === CALIBRATION_VERSION;
}

/**
 * A profile that HAS calibration points but from an older version — i.e. it
 * looks calibrated but needs redoing. Lets the UI show a clearer message than
 * "not calibrated yet".
 *
 * @param {object|null} profile
 * @returns {boolean}
 */
export function isCalibrationStale(profile) {
  return !!profile?.points && profile.calibrationVersion !== CALIBRATION_VERSION;
}

// ─── Calibration mapping ───────────────────────────────────────────────────────

/**
 * Piecewise linear map: raw gaze value → [0,1] screen position.
 *
 * Calibration anchors:
 *   points.top    → calibrated 0
 *   points.center → calibrated 0.5
 *   points.bottom → calibrated 1
 *
 * @param {number} rawY
 * @param {{ points: { top: number, center: number, bottom: number } }} profile
 * @param {number} [offset] - session recenter shift, subtracted from rawY to
 *   undo drift since calibration (never stored in the profile)
 * @returns {number|null}
 */
export function mapRawToCalibratedY(rawY, profile, offset = 0) {
  rawY -= offset;
  if (!profile || !profile.points) return null;

  const { top, center, bottom } = profile.points;

  if (
    typeof top !== "number" ||
    typeof center !== "number" ||
    typeof bottom !== "number" ||
    isNaN(top) ||
    isNaN(center) ||
    isNaN(bottom)
  ) {
    return null;
  }

  let calibrated;

  // Upper segment: top → center maps to 0 → 0.5
  if (rawY <= center) {
    const range = center - top;
    if (Math.abs(range) < 1e-6) {
      calibrated = 0.5;
    } else {
      calibrated = ((rawY - top) / range) * 0.5;
    }
  } else {
    // Lower segment: center → bottom maps to 0.5 → 1
    const range = bottom - center;
    if (Math.abs(range) < 1e-6) {
      calibrated = 0.5;
    } else {
      calibrated = 0.5 + ((rawY - center) / range) * 0.5;
    }
  }

  if (!isFinite(calibrated) || isNaN(calibrated)) return null;

  return Math.min(1, Math.max(0, calibrated));
}

/**
 * Inverse of mapRawToCalibratedY (no offset): the raw signal that maps to a
 * calibrated position. Recenter uses it to find where the middle of the no-scroll
 * band sits in the raw signal.
 *
 * @param {number} y - calibrated position in [0, 1]
 * @param {{ points: { top: number, center: number, bottom: number } }} profile
 * @returns {number|null}
 */
export function calibratedToRaw(y, profile) {
  if (!profile || !profile.points) return null;
  const { top, center, bottom } = profile.points;
  if (![top, center, bottom].every((n) => typeof n === "number" && isFinite(n))) return null;
  const c = Math.min(1, Math.max(0, y));
  return c <= 0.5 ? top + (c / 0.5) * (center - top) : center + ((c - 0.5) / 0.5) * (bottom - center);
}

// ─── Calibration capture ───────────────────────────────────────────────────────

// Frames in the first stretch after the dot lights up are discarded: the eyes are
// still travelling to it, and those readings would skew the step's value.
export const SETTLE_MS = 400;
// Reject frames where the eyes are clearly turned to the side. Looking up/down
// at the (centered) dots can add some horizontal cross-talk, so keep this high
// and only reject a strong sideways turn.
export const SIDE_GAZE_MAX = 0.6;

/**
 * Whether a gaze frame should count toward the current calibration step: the
 * eyes have had time to settle, the face is confidently tracked, and the eyes
 * aren't turned to the side.
 *
 * @param {{ confidence: number, hasFace: boolean, sideGaze?: number }} gaze
 * @param {number} elapsedMs - time since the step started collecting
 * @returns {boolean}
 */
export function isUsableSample(gaze, elapsedMs) {
  return (
    elapsedMs >= SETTLE_MS &&
    gaze.confidence >= 0.5 &&
    gaze.hasFace &&
    (gaze.sideGaze ?? 0) < SIDE_GAZE_MAX
  );
}

// The top→bottom span must exceed this multiple of the measurement noise (the
// largest per-step standard deviation). This is the core "did your gaze really
// move" guard, expressed relative to jitter so it scales with the signal.
const MIN_SNR = 3;
// A tiny absolute floor on the top→bottom span, so a degenerate near-flat signal
// with near-zero noise can't sneak past the SNR check.
const MIN_TOTAL_SPAN = 0.03;
// Adjacent points must land in order (top < center < bottom) with at least this
// much gap, or a step was mis-captured and the mapping can't separate the zones.
const MIN_SEPARATION = 0.01;

/**
 * Check a full set of captured points and, if they are unusable, say which single
 * step to redo (when one is clearly to blame) or that everything should be redone.
 *
 * @param {{ top: number, center: number, bottom: number }} points
 * @param {{ top?: number, center?: number, bottom?: number }} noise - per-step stddev
 * @returns {{ ok: true } | { ok: false, badStep: "top"|"center"|"bottom"|null, reason: string }}
 */
export function diagnoseCalibration(points, noise = {}) {
  const { top, center, bottom } = points;
  const readings = `(top ${top.toFixed(2)}, center ${center.toFixed(2)}, bottom ${bottom.toFixed(2)})`;

  const topBad = top + MIN_SEPARATION > center;
  const bottomBad = center + MIN_SEPARATION > bottom;

  if (topBad || bottomBad) {
    // Both gaps wrong: the order is reversed or flat, so no one step is to blame.
    let badStep = null;
    if (topBad && !bottomBad) badStep = noisier(noise, "top", "center");
    else if (bottomBad && !topBad) badStep = noisier(noise, "center", "bottom");
    return {
      ok: false,
      badStep,
      reason: `Those readings didn't line up ${readings}. Look straight at each dot in turn.`,
    };
  }

  const maxNoise = Math.max(noise.top ?? 0, noise.center ?? 0, noise.bottom ?? 0, 1e-4);
  const span = bottom - top;
  if (span < MIN_SNR * maxNoise || span < MIN_TOTAL_SPAN) {
    return {
      ok: false,
      badStep: null,
      reason: `Your gaze barely moved ${readings}. Really look up at the top dot and down at the bottom dot — moving your head is fine.`,
    };
  }
  return { ok: true };
}

// Of two neighbouring steps that disagree, blame the one that was noisier;
// on a tie, blame the middle one (every neighbouring pair includes it).
function noisier(noise, a, b) {
  const na = noise[a] ?? 0;
  const nb = noise[b] ?? 0;
  if (na === nb) return "center";
  return na > nb ? a : b;
}
