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
  const center = (SCROLL_UP_THRESHOLD + SCROLL_DOWN_THRESHOLD) / 2;
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
