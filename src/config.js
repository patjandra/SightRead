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
//   v5 — same blend, unclamped raw signal + rebalanced gains (current)
export const CALIBRATION_VERSION = 5;

// Gaze-zone thresholds on the calibrated [0,1] value. Shared by the scroll
// controller (which acts on them) and the debug readout (which displays them).
// Intentionally asymmetric: looking down drives the eye blendshapes strongly
// while looking up responds weakly, so the up zone is widened (higher up
// threshold) to make scrolling up as easy to trigger as scrolling down.
export const SCROLL_UP_THRESHOLD = 0.47;   // calibratedY below this → scroll up
export const SCROLL_DOWN_THRESHOLD = 0.62; // calibratedY above this → scroll down
