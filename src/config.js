/**
 * App-wide tunables and versions, kept in one place so values that are used in
 * more than one module can't drift out of sync.
 */

// Bump whenever the gaze estimator or calibration math changes in a way that
// makes previously-saved calibration points meaningless. Profiles stamped with
// an older version are treated as uncalibrated so the user is prompted to
// recalibrate instead of scrolling with stale data.
//
//   v1 — iris-vs-corner geometry
//   v2 — MediaPipe eye blendshapes
//   v3 — blendshapes with higher amplification
//   v4 — eye blendshapes blended with head pitch
//   v5 — same blend, unclamped raw signal + rebalanced gains
//   v6 — eyes weighted well above head pitch
//   v7 — eye and head weighted equally, so head tilt with a fixed gaze cancels (current)
export const CALIBRATION_VERSION = 7;

// Gaze-zone thresholds on the calibrated [0,1] value. Shared by the scroll
// controller (which acts on them) and the debug readout (which displays them).
// Intentionally asymmetric: looking down drives the eye blendshapes strongly
// while looking up responds weakly, so the up zone is widened (higher up
// threshold) to make scrolling up as easy to trigger as scrolling down.
export const SCROLL_UP_THRESHOLD = 0.47;   // calibratedY below this → scroll up
export const SCROLL_DOWN_THRESHOLD = 0.62; // calibratedY above this → scroll down
// Middle of the no-scroll band. Recenter aims the user's gaze here rather than at
// the calibrated 0.5, which sits only 0.03 from the up edge and 0.12 from the
// down edge and so tipped a resting gaze into scrolling up.
export const SCROLL_BAND_CENTER = (SCROLL_UP_THRESHOLD + SCROLL_DOWN_THRESHOLD) / 2; // 0.545

/**
 * Scroll zones for a given page zoom. The dead zone around the reading band is
 * widened as the page is zoomed in (the music is bigger, so reading one staff
 * moves your gaze further). It is never narrower than the base thresholds: a
 * narrower band would put a resting gaze (calibrated 0.5) inside the scroll-up
 * zone, which made the page drift upward when zoomed out. Its center stays where
 * the thresholds above put it, and at zoom 1 or less it matches them exactly.
 * The half-width is capped so the dead zone never swallows most of the screen.
 *
 * @param {number} [zoom] - page zoom factor (1 = 100%)
 * @returns {{ up: number, down: number }}
 */
export function scrollZones(zoom = 1) {
  const center = SCROLL_BAND_CENTER;
  const half = (SCROLL_DOWN_THRESHOLD - SCROLL_UP_THRESHOLD) / 2;
  const scaled = Math.min(0.2, Math.max(half, half * zoom));
  return { up: center - scaled, down: center + scaled };
}

// One Euro filter on the calibrated gaze position (see gaze/oneEuroFilter.js).
// Lower MIN_CUTOFF = steadier at rest but laggier; higher BETA = quicker catch-up
// when the gaze moves fast. Tune by feel on a real camera.
export const GAZE_FILTER_MIN_CUTOFF = 1.0;
export const GAZE_FILTER_BETA = 0.02;

// How long tracking may drop out (a blink, a missed frame) before the scroll
// controller forgets its dwell state. Scrolling itself is paused during the gap.
export const GAP_HOLD_MS = 250;

// Spotify app client ID. Public by design (PKCE needs no secret). Override with
// VITE_SPOTIFY_CLIENT_ID at build time; with it empty the Music section explains
// that Spotify isn't configured.
export const SPOTIFY_CLIENT_ID =
  import.meta.env?.VITE_SPOTIFY_CLIENT_ID || "389bac096d4e4f8ba4c00ceab154e64c";

// Automatic drift correction (see gaze/driftEstimator.js). When the head settles
// in a new pose, the estimator compares where the gaze lands while reading now
// against where it landed in the previous pose, and applies the difference as a
// session-only offset. Reading habits cancel out of that comparison; they do not
// cancel out of "the gaze should sit at the center", which is why it isn't used.
// All values are starting points to tune by feel on a real camera; the `auto`
// cell in the Gaze data readout shows the live correction.
export const AUTO_RECENTER = {
  // Only frames whose corrected position is inside this band count. It is wide on
  // purpose (only the saturated ends are dropped): the same band applies before
  // and after a move, so a reader's sweep appears in both and cancels.
  captureWindow: [0.1, 0.9],
  // Frames are ignored below this tracking-quality score (yellow and worse).
  minQuality: 0.45,
  // Right after Start tracking the gaze is still on the sidebar: ignore it.
  graceMs: 2000,
  // How much recent history forms the "before" picture, and how long to measure
  // once the head has settled somewhere new.
  baselineMs: 15000,
  measureMs: 5000,
  minSamples: 20,
  // The head must hold still this long, at a pose this far from the last one, to
  // count as a new orientation. Distance is in units of each face measurement's
  // free range (1 = about the width of the default green zone).
  poseHoldMs: 1500,
  poseShift: 1,
  poseUnit: { cx: 0.08, cy: 0.08, height: 0.15, yaw: 0.06 },
  // Shifts smaller than this (fraction of the raw span bottom - top) are noise.
  deadBand: 0.02,
  // The correction is eased in at this many raw spans per second.
  rate: 0.1,
  // The total correction never exceeds this fraction of the raw span; past it a
  // full recalibration is the right fix.
  maxOffset: 0.12,
};
