/**
 * Vertical gaze estimator using skull-fixed eye corner landmarks.
 *
 * Why corners instead of eyelids:
 *   The inner (canthus medialis) and outer (canthus lateralis) eye corners are
 *   anchored to the orbital bone — they do not move when the eyeball rotates.
 *   Eyelid landmarks (159, 145, …) partially follow the iris up/down, which
 *   dilutes the signal and makes the old approach track head tilt more than gaze.
 *
 *   By measuring the iris center's Y offset from the corner midpoint, then
 *   normalizing by eye WIDTH (also skull-fixed and scale-stable), we get a
 *   value that reflects eyeball rotation and is largely independent of where
 *   the head is positioned or tilted.
 *
 * Landmark indices (MediaPipe 478-point face mesh):
 *   Left  inner corner : 133   Left  outer corner : 33
 *   Right inner corner : 362   Right outer corner : 263
 *   Left  upper lid    : 159   Left  lower lid    : 145
 *   Right upper lid    : 386   Right lower lid    : 374
 *   Left  iris center  : 468   Right iris center  : 473
 */

const LEFT_INNER  = 133;
const LEFT_OUTER  = 33;
const RIGHT_INNER = 362;
const RIGHT_OUTER = 263;
const LEFT_UPPER  = 159;
const LEFT_LOWER  = 145;
const RIGHT_UPPER = 386;
const RIGHT_LOWER = 374;
const LEFT_IRIS   = 468;
const RIGHT_IRIS  = 473;

// How much to amplify the iris-offset signal.
const AMPLIFICATION = 4.0;

// Eye Aspect Ratio threshold: eyelid opening / eye width.
// Below this the eyes are too closed or squinted to produce a reliable gaze
// reading, so we return confidence 0 and scrolling stops.
// Typical value for a comfortably open eye is ~0.20–0.30; 0.15 catches blinks
// and heavy squinting while leaving normal reading gaze unaffected.
const EAR_THRESHOLD = 0.15;

/**
 * @param {object|null} result - detectForVideo result from FaceLandmarker
 * @returns {{ rawY: number, confidence: number, hasFace: boolean }}
 */
export function estimateGaze(result) {
  if (!result?.faceLandmarks?.length) {
    return { rawY: 0.5, confidence: 0, hasFace: false };
  }

  const lm = result.faceLandmarks[0];

  if (!lm || lm.length < 468) {
    return { rawY: 0.5, confidence: 0, hasFace: false };
  }

  // Iris landmarks are indices 468-477; require both centers to be present.
  if (lm.length <= RIGHT_IRIS || !lm[LEFT_IRIS] || !lm[RIGHT_IRIS]) {
    return { rawY: 0.5, confidence: 0, hasFace: true };
  }

  const leftInner  = lm[LEFT_INNER];
  const leftOuter  = lm[LEFT_OUTER];
  const rightInner = lm[RIGHT_INNER];
  const rightOuter = lm[RIGHT_OUTER];
  const leftUpper  = lm[LEFT_UPPER];
  const leftLower  = lm[LEFT_LOWER];
  const rightUpper = lm[RIGHT_UPPER];
  const rightLower = lm[RIGHT_LOWER];
  const leftIris   = lm[LEFT_IRIS];
  const rightIris  = lm[RIGHT_IRIS];

  if (!leftInner || !leftOuter || !rightInner || !rightOuter ||
      !leftUpper || !leftLower || !rightUpper || !rightLower) {
    return { rawY: 0.5, confidence: 0, hasFace: true };
  }

  // Eye width: horizontal span between corners. Stable, scales with face size.
  const leftEyeW  = Math.abs(leftOuter.x  - leftInner.x);
  const rightEyeW = Math.abs(rightOuter.x - rightInner.x);

  if (leftEyeW < 0.01 || rightEyeW < 0.01) {
    return { rawY: 0.5, confidence: 0, hasFace: true };
  }

  // Eye Aspect Ratio: eyelid opening normalised by eye width.
  // When the eyes are closed or squinted this drops toward 0.
  const leftEAR  = (leftLower.y  - leftUpper.y)  / leftEyeW;
  const rightEAR = (rightLower.y - rightUpper.y) / rightEyeW;
  const avgEAR   = (leftEAR + rightEAR) / 2;

  if (avgEAR < EAR_THRESHOLD) {
    return { rawY: 0.5, confidence: 0, hasFace: true };
  }

  // Corner midpoint Y: skull-fixed vertical reference for each eye.
  const leftCornerMidY  = (leftInner.y  + leftOuter.y)  / 2;
  const rightCornerMidY = (rightInner.y + rightOuter.y) / 2;

  // Signed offset: positive → iris below corner midpoint → looking down
  //                negative → iris above corner midpoint → looking up
  const leftOffset  = (leftIris.y  - leftCornerMidY)  / leftEyeW;
  const rightOffset = (rightIris.y - rightCornerMidY) / rightEyeW;
  const avgOffset   = (leftOffset + rightOffset) / 2;

  const rawY = 0.5 + avgOffset * AMPLIFICATION;

  if (!isFinite(rawY) || isNaN(rawY)) {
    return { rawY: 0.5, confidence: 0, hasFace: true };
  }

  return { rawY: Math.min(1, Math.max(0, rawY)), confidence: 1, hasFace: true };
}
