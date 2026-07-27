/**
 * Vertical gaze estimator using MediaPipe eye blendshapes, plus a framing check
 * that only trusts the reading when the face is well-positioned for the camera.
 *
 * Why blendshapes instead of iris-vs-corner geometry:
 *   The previous approach measured the iris center's Y offset from the eye
 *   corners in the 2D image. That relationship shifts when the head PITCHES
 *   (nods) even if the eyeball doesn't rotate, so head movement leaked in as
 *   fake gaze.
 *
 *   MediaPipe's FaceLandmarker emits ARKit-style blendshape coefficients,
 *   including eyeLookUp/eyeLookDown per eye. These model eyeball rotation
 *   RELATIVE TO THE HEAD, so they respond to where the eyes point and stay
 *   largely stable as the head tilts — exactly what we want for gaze scrolling.
 *
 * Vertical gaze signal:
 *   lookUp   = mean(eyeLookUpLeft,   eyeLookUpRight)     ∈ [0,1]
 *   lookDown = mean(eyeLookDownLeft, eyeLookDownRight)   ∈ [0,1]
 *   vertical = lookDown - lookUp                         ∈ [-1,1]  (+ = down)
 *   rawY     = 0.5 + vertical * 0.5 * AMPLIFICATION      (clamped [0,1])
 *
 *   Calibration (top/center/bottom) later maps this raw value onto the screen,
 *   so AMPLIFICATION only needs to give enough separation to calibrate against.
 */

// Amplify the raw up/down difference so ordinary reading gaze (which rarely
// drives the blendshapes to their extremes) produces a usable spread.
const AMPLIFICATION = 1.6;

// Blink/closed-eye cutoff: eyeBlink coefficients approach 1 when the lid closes.
// Above this the eye gaze reading is unreliable, so we drop confidence to 0 and
// scrolling pauses (mirrors the old EAR-based blink guard).
const BLINK_THRESHOLD = 0.5;

// ─── Framing thresholds (all in normalized [0,1] image coordinates) ──────────
// The blendshapes only track accurately when the whole face is comfortably
// inside the frame at a reasonable distance. Outside these bounds we pause and
// tell the user how to reposition instead of scrolling on a bad reading.
const FRAME_EDGE_MARGIN = 0.03; // landmarks this close to an edge = cut off
const MIN_FACE_HEIGHT   = 0.22; // face shorter than this = too far away
const MAX_FACE_HEIGHT   = 0.90; // face taller than this  = too close
const CENTER_X_MIN = 0.30;
const CENTER_X_MAX = 0.70;
const CENTER_Y_MIN = 0.28;
const CENTER_Y_MAX = 0.72;

/**
 * Assess how well the face is framed for tracking.
 *
 * @param {Array<{x:number,y:number}>} lm - face landmarks
 * @returns {string|null} an actionable hint, or null when framing is good
 */
function assessFraming(lm) {
  let minX = 1, minY = 1, maxX = 0, maxY = 0;
  for (const p of lm) {
    if (p.x < minX) minX = p.x;
    if (p.x > maxX) maxX = p.x;
    if (p.y < minY) minY = p.y;
    if (p.y > maxY) maxY = p.y;
  }

  // Any part of the face cut off by the frame edge → unreliable landmarks.
  if (
    minX < FRAME_EDGE_MARGIN ||
    maxX > 1 - FRAME_EDGE_MARGIN ||
    minY < FRAME_EDGE_MARGIN ||
    maxY > 1 - FRAME_EDGE_MARGIN
  ) {
    return "Keep your whole face in view";
  }

  const faceHeight = maxY - minY;
  if (faceHeight < MIN_FACE_HEIGHT) return "Move closer to the camera";
  if (faceHeight > MAX_FACE_HEIGHT) return "Move back from the camera";

  const centerX = (minX + maxX) / 2;
  const centerY = (minY + maxY) / 2;
  if (
    centerX < CENTER_X_MIN ||
    centerX > CENTER_X_MAX ||
    centerY < CENTER_Y_MIN ||
    centerY > CENTER_Y_MAX
  ) {
    return "Center your face in the camera";
  }

  return null;
}

/**
 * @param {object|null} result - detectForVideo result from FaceLandmarker
 * @returns {{ rawY: number, confidence: number, hasFace: boolean, hint: string|null }}
 */
export function estimateGaze(result) {
  const lm = result?.faceLandmarks?.[0];
  if (!lm?.length) {
    return { rawY: 0.5, confidence: 0, hasFace: false, hint: "No face detected" };
  }

  // Framing gate: if the face isn't well-positioned, pause and say how to fix
  // it rather than scrolling on an inaccurate reading.
  const framingHint = assessFraming(lm);
  if (framingHint) {
    return { rawY: 0.5, confidence: 0, hasFace: true, hint: framingHint };
  }

  const categories = result?.faceBlendshapes?.[0]?.categories;
  if (!categories?.length) {
    // Face detected but blendshapes unavailable — can't estimate gaze.
    return { rawY: 0.5, confidence: 0, hasFace: true, hint: null };
  }

  // Build a name→score lookup once; blendshape order isn't guaranteed.
  const score = {};
  for (const c of categories) score[c.categoryName] = c.score;
  const get = (name) => score[name] ?? 0;

  // Closed eyes (blink or squint) make the gaze reading meaningless. This is a
  // normal, transient state, so no hint — just pause.
  const blink = Math.max(get("eyeBlinkLeft"), get("eyeBlinkRight"));
  if (blink > BLINK_THRESHOLD) {
    return { rawY: 0.5, confidence: 0, hasFace: true, hint: null };
  }

  const lookUp   = (get("eyeLookUpLeft")   + get("eyeLookUpRight"))   / 2;
  const lookDown = (get("eyeLookDownLeft") + get("eyeLookDownRight")) / 2;

  // Signed vertical gaze: positive → looking down, negative → looking up.
  const vertical = lookDown - lookUp;

  const rawY = 0.5 + vertical * 0.5 * AMPLIFICATION;

  if (!isFinite(rawY) || isNaN(rawY)) {
    return { rawY: 0.5, confidence: 0, hasFace: true, hint: null };
  }

  return {
    rawY: Math.min(1, Math.max(0, rawY)),
    confidence: 1,
    hasFace: true,
    hint: null,
  };
}
