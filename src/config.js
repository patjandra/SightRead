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
//   v2 — MediaPipe eye blendshapes (current)
export const CALIBRATION_VERSION = 2;

// Gaze-zone thresholds on the calibrated [0,1] value. Shared by the scroll
// controller (which acts on them) and the debug readout (which displays them).
export const SCROLL_UP_THRESHOLD = 0.38;   // calibratedY below this → scroll up
export const SCROLL_DOWN_THRESHOLD = 0.62; // calibratedY above this → scroll down
