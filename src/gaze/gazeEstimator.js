/**
 * Vertical gaze estimator using MediaPipe eye blendshapes.
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

/**
 * @param {object|null} result - detectForVideo result from FaceLandmarker
 * @returns {{ rawY: number, confidence: number, hasFace: boolean }}
 */
export function estimateGaze(result) {
  if (!result?.faceLandmarks?.length) {
    return { rawY: 0.5, confidence: 0, hasFace: false };
  }

  const categories = result?.faceBlendshapes?.[0]?.categories;
  if (!categories?.length) {
    // Face detected but blendshapes unavailable — can't estimate gaze.
    return { rawY: 0.5, confidence: 0, hasFace: true };
  }

  // Build a name→score lookup once; blendshape order isn't guaranteed.
  const score = {};
  for (const c of categories) score[c.categoryName] = c.score;
  const get = (name) => score[name] ?? 0;

  // Closed eyes (blink or squint) make the gaze reading meaningless.
  const blink = Math.max(get("eyeBlinkLeft"), get("eyeBlinkRight"));
  if (blink > BLINK_THRESHOLD) {
    return { rawY: 0.5, confidence: 0, hasFace: true };
  }

  const lookUp   = (get("eyeLookUpLeft")   + get("eyeLookUpRight"))   / 2;
  const lookDown = (get("eyeLookDownLeft") + get("eyeLookDownRight")) / 2;

  // Signed vertical gaze: positive → looking down, negative → looking up.
  const vertical = lookDown - lookUp;

  const rawY = 0.5 + vertical * 0.5 * AMPLIFICATION;

  if (!isFinite(rawY) || isNaN(rawY)) {
    return { rawY: 0.5, confidence: 0, hasFace: true };
  }

  return { rawY: Math.min(1, Math.max(0, rawY)), confidence: 1, hasFace: true };
}
