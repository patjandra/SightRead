/**
 * How reliable the gaze reading is likely to be given where the face sits in the
 * camera frame. Four measurements of the face are each scored 0 (fine) to 1 (as
 * bad as the point where tracking pauses), and the worst one sets the overall
 * score:
 *
 *   cx, cy — face center, as a fraction of the frame
 *   height — face height as a fraction of the frame (small = far, large = close)
 *   yaw    — nose offset from the cheek midline as a fraction of face width
 *            (0 = facing the camera)
 *
 * Each has a free range (the "sweet spot", costing nothing) and a full range
 * (where it costs everything). The free ranges start from sensible defaults and
 * can be replaced by ones learned from the "Try it" dot test, so the green zone
 * matches where the user's own gaze actually held steady.
 */

const FULL = {
  cx: [0.2, 0.8],     // the framing gate's limits
  cy: [0.2, 0.8],
  height: [0.22, 0.9],
  yaw: [-0.25, 0.25],
};

export const DEFAULT_SPOT = {
  cx: { free: [0.42, 0.58], full: FULL.cx },
  cy: { free: [0.42, 0.58], full: FULL.cy },
  height: { free: [0.3, 0.65], full: FULL.height },
  yaw: { free: [-0.06, 0.06], full: FULL.yaw },
};

// Landmarks on the 478-point mesh.
const NOSE_TIP = 1;
const LEFT_CHEEK = 234;
const RIGHT_CHEEK = 454;

// Score cutoffs for the colour levels (score = 1 − worst penalty).
const GREEN_MIN = 0.7;
const YELLOW_MIN = 0.45;
const ORANGE_MIN = 0.2;

const clamp01 = (n) => Math.min(1, Math.max(0, n));

/** Measure the face in a frame. */
export function faceFeatures(lm) {
  let minX = 1, minY = 1, maxX = 0, maxY = 0;
  for (const p of lm) {
    if (p.x < minX) minX = p.x;
    if (p.x > maxX) maxX = p.x;
    if (p.y < minY) minY = p.y;
    if (p.y > maxY) maxY = p.y;
  }
  let yaw = 0;
  const left = lm[LEFT_CHEEK], right = lm[RIGHT_CHEEK], nose = lm[NOSE_TIP];
  const width = left && right ? Math.abs(right.x - left.x) : 0;
  if (nose && width > 1e-3) yaw = (nose.x - (left.x + right.x) / 2) / width;
  return { cx: (minX + maxX) / 2, cy: (minY + maxY) / 2, height: maxY - minY, yaw };
}

// Penalty for one value against its free and full ranges.
function penalty(value, { free: [lo, hi], full: [fullLo, fullHi] }) {
  if (value < lo) return clamp01((lo - value) / (lo - fullLo));
  if (value > hi) return clamp01((value - hi) / (fullHi - hi));
  return 0;
}

/**
 * @param {{cx:number,cy:number,height:number,yaw:number}} features
 * @param {typeof DEFAULT_SPOT} [spot]
 * @returns {{ score: number, hint: string|null }} score in [0,1] (1 = ideal); hint
 *   names the worst factor, or null when it costs nothing
 */
export function scoreFeatures(features, spot = DEFAULT_SPOT) {
  const factors = [
    [penalty(features.cx, spot.cx), "Center your face"],
    [penalty(features.cy, spot.cy), "Center your face"],
    [penalty(features.height, spot.height), features.height < spot.height.free[0] ? "Move closer" : "Move back"],
    [penalty(features.yaw, spot.yaw), "Face the screen"],
  ];
  const [worst, hint] = factors.reduce((a, b) => (b[0] > a[0] ? b : a));
  return { score: 1 - worst, hint: worst > 0 ? hint : null };
}

/**
 * @param {Array<{x:number,y:number,z:number}>} lm - face landmarks
 * @param {typeof DEFAULT_SPOT} [spot]
 */
export function assessQuality(lm, spot = DEFAULT_SPOT) {
  const features = faceFeatures(lm);
  return { ...scoreFeatures(features, spot), features };
}

// ─── Learning the sweet spot from the dot test ──────────────────────────────

// Readings needed before a learned spot is trusted; fewer falls back to defaults.
export const MIN_SPOT_SAMPLES = 20;
// A learned range is never narrower than this half-width, so holding very still
// during the test doesn't make the green zone impossibly small.
const MIN_HALF = { cx: 0.04, cy: 0.04, height: 0.05, yaw: 0.04 };
// Extra room added around the observed range.
const PAD = { cx: 0.02, cy: 0.02, height: 0.03, yaw: 0.02 };
// Keep the learned range inside the full range by at least this much.
const EDGE_GAP = 0.02;

const percentile = (sorted, p) => sorted[Math.min(sorted.length - 1, Math.floor(p * sorted.length))];

/**
 * Build a sweet spot from face measurements taken while the dot test's gaze dot
 * sat in the center band. Uses the 10th–90th percentile range so a stray frame
 * doesn't stretch it.
 *
 * @param {Array<{cx:number,cy:number,height:number,yaw:number}>} samples
 * @returns {typeof DEFAULT_SPOT | null} null when there are too few readings
 */
export function learnSweetSpot(samples) {
  if (!samples || samples.length < MIN_SPOT_SAMPLES) return null;
  const spot = {};
  for (const key of Object.keys(FULL)) {
    const sorted = samples.map((s) => s[key]).sort((a, b) => a - b);
    let lo = percentile(sorted, 0.1) - PAD[key];
    let hi = percentile(sorted, 0.9) + PAD[key];
    const mid = (lo + hi) / 2;
    const half = Math.max((hi - lo) / 2, MIN_HALF[key]);
    const [fullLo, fullHi] = FULL[key];
    lo = Math.max(mid - half, fullLo + EDGE_GAP);
    hi = Math.min(mid + half, fullHi - EDGE_GAP);
    spot[key] = { free: [lo, Math.max(lo, hi)], full: FULL[key] };
  }
  return spot;
}

/** Colour level for a quality score, or "red" when there is no usable score. */
export function qualityLevel(score) {
  if (score == null) return "red";
  if (score >= GREEN_MIN) return "green";
  if (score >= YELLOW_MIN) return "yellow";
  if (score >= ORANGE_MIN) return "orange";
  return "red";
}

/**
 * How much of the normal scroll speed to allow for a quality score: full in the
 * green, tapering smoothly through the yellow, and none once it is orange or red.
 * Scrolling on a doubtful reading does more harm than pausing.
 */
export function scrollScaleForQuality(score) {
  if (score == null) return 1;
  return clamp01((score - YELLOW_MIN) / (GREEN_MIN - YELLOW_MIN));
}

export const LEVEL_COLORS = {
  green: "#22c55e",
  yellow: "#eab308",
  orange: "#f97316",
  red: "#ef4444",
};
