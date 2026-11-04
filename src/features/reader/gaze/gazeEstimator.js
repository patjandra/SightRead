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
 * Vertical gaze signal (blended head + eyes):
 *   eyeVertical  = mean(eyeLookDown) - mean(eyeLookUp)   ∈ [-1,1]  (+ = down)
 *   headVertical = head pitch from landmark depth         ≈ sin(pitch), (+ = down)
 *   vertical     = eyeVertical * EYE_GAIN + headVertical * HEAD_GAIN
 *   rawY         = 0.5 + vertical * 0.5                   (clamped [0,1])
 *
 *   Why blend in head pitch: the eyeLookUp/Down coefficients move only a little
 *   for the ~10-15° of eyeball rotation across a nearby screen, so on their own
 *   they barely separate the top and bottom of the page — calibration couldn't
 *   get a usable range. People also naturally tilt their head toward what they
 *   read, and head-relative blendshapes cancel that out, throwing away real
 *   signal. Adding a head-pitch term (from the forehead-vs-chin depth, which is
 *   NOT head-relative) makes looking up/down produce a strong signal whether the
 *   user moves their eyes, their head, or both. Calibration then normalizes the
 *   combined value onto the screen.
 */

import { assessQuality } from "./trackingQuality.js";

// Relative weights of the two contributions. They are equal on purpose.
//
// The eye blendshapes measure the eyeballs RELATIVE TO THE HEAD, so tilting the
// head up while still looking at the same spot rolls the eyes down inside the
// head and raises eyeVertical. The head-pitch term moves the opposite way by the
// same amount, so with equal gains the two cancel: gaze at a fixed spot stays put
// however the head is tilted, and calibY only moves when the real line of sight
// does. (Measured: head tilted up took eye 0.2 -> 0.7 and head 0.2 -> -0.3, equal
// and opposite swings, which gives a 1:1 ratio.) Weighting the eyes well above the
// head left that compensation uncancelled, so tilting the head up pushed the
// reading toward "looking down". Calibration normalizes the sum, so only the
// RATIO matters, not the absolute scale.
const EYE_GAIN  = 3.0;
const HEAD_GAIN = 3.0;

// Blink/closed-eye cutoff: eyeBlink coefficients approach 1 when the lid closes.
// Above this the eye gaze reading is unreliable, so we drop confidence to 0 and
// scrolling pauses (mirrors the old EAR-based blink guard).
const BLINK_THRESHOLD = 0.5;

// ─── Framing thresholds (all in normalized [0,1] image coordinates) ──────────
// The blendshapes only track accurately when the whole face is comfortably
// inside the frame at a reasonable distance. Outside these bounds we pause and
// tell the user how to reposition instead of scrolling on a bad reading.
const FRAME_EDGE_MARGIN = 0.02; // landmarks this close to an edge = cut off
const MIN_FACE_HEIGHT   = 0.22; // face shorter than this = too far away
const MAX_FACE_HEIGHT   = 0.90; // face taller than this  = too close
const CENTER_X_MIN = 0.20;
const CENTER_X_MAX = 0.80;
const CENTER_Y_MIN = 0.20;
const CENTER_Y_MAX = 0.80;

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

// Landmark indices on the 478-point mesh for the vertical face axis.
const FOREHEAD_IDX = 10;
const CHIN_IDX = 152;

/**
 * Head pitch as a signed, distance-invariant scalar, from the depth difference
 * between the forehead and chin landmarks.
 *
 * MediaPipe's landmark z grows more negative closer to the camera. When the head
 * tilts DOWN (nods), the forehead rotates toward the camera and the chin away,
 * so (z_chin − z_forehead) becomes positive. Dividing by the 3D forehead→chin
 * distance normalizes for how close the user is, giving roughly sin(pitch).
 *
 * Unlike the eyeLook blendshapes (which are head-relative), this term captures
 * actual head movement — intentionally, so a natural head tilt contributes.
 *
 * @param {Array<{x:number,y:number,z:number}>} lm - face landmarks
 * @returns {number} ~sin(pitch); positive looking down, negative looking up
 */
function headPitchDown(lm) {
  const forehead = lm[FOREHEAD_IDX];
  const chin = lm[CHIN_IDX];
  if (!forehead || !chin) return 0;
  const dx = chin.x - forehead.x;
  const dy = chin.y - forehead.y;
  const dz = chin.z - forehead.z;
  const dist = Math.hypot(dx, dy, dz) || 1e-6;
  return dz / dist;
}

/**
 * @param {object|null} result - detectForVideo result from FaceLandmarker
 * @returns {{ rawY: number, confidence: number, hasFace: boolean, hint: string|null }}
 */
export function estimateGaze(result) {
  const lm = result?.faceLandmarks?.[0];
  if (!lm?.length) {
    return { rawY: 0.5, confidence: 0, hasFace: false, hint: "No face detected", quality: 0, qualityHint: null, features: null };
  }

  // Framing gate: if the face isn't well-positioned, pause and say how to fix
  // it rather than scrolling on an inaccurate reading.
  const framingHint = assessFraming(lm);
  if (framingHint) {
    return { rawY: 0.5, confidence: 0, hasFace: true, hint: framingHint, quality: 0, qualityHint: framingHint, features: assessQuality(lm).features };
  }

  // How good the face position is for tracking (drives the green→red aura).
  const { score: quality, hint: qualityHint, features } = assessQuality(lm);

  const categories = result?.faceBlendshapes?.[0]?.categories;
  if (!categories?.length) {
    // Face detected but blendshapes unavailable — can't estimate gaze.
    return { rawY: 0.5, confidence: 0, hasFace: true, hint: null, quality, qualityHint, features };
  }

  // Build a name→score lookup once; blendshape order isn't guaranteed.
  const score = {};
  for (const c of categories) score[c.categoryName] = c.score;
  const get = (name) => score[name] ?? 0;

  // Closed eyes (blink or squint) make the gaze reading meaningless. This is a
  // normal, transient state, so no hint — just pause.
  const blink = Math.max(get("eyeBlinkLeft"), get("eyeBlinkRight"));
  if (blink > BLINK_THRESHOLD) {
    return { rawY: 0.5, confidence: 0, hasFace: true, hint: null, quality, qualityHint, features };
  }

  const lookUp   = (get("eyeLookUpLeft")   + get("eyeLookUpRight"))   / 2;
  const lookDown = (get("eyeLookDownLeft") + get("eyeLookDownRight")) / 2;

  // Two signed vertical contributions, both positive when looking DOWN:
  //   eyeVertical  — eyeball rotation relative to the head (small)
  //   headVertical — head pitch, captures a natural head tilt (larger)
  const eyeVertical  = lookDown - lookUp;
  const headVertical = headPitchDown(lm);

  const vertical = eyeVertical * EYE_GAIN + headVertical * HEAD_GAIN;

  const rawY = 0.5 + vertical * 0.5;

  // Horizontal deviation magnitude: ~0 when looking straight ahead, growing
  // toward ~1 as the eyes turn to either side. Calibration uses this to reject
  // frames where the user isn't actually looking at the (centered) dot.
  const sideGaze =
    (get("eyeLookInLeft") +
      get("eyeLookOutLeft") +
      get("eyeLookInRight") +
      get("eyeLookOutRight")) /
    2;

  if (!isFinite(rawY) || isNaN(rawY)) {
    return { rawY: 0.5, confidence: 0, hasFace: true, hint: null, quality, qualityHint, features };
  }

  return {
    // NOT clamped to [0,1] on purpose: calibration maps whatever range this
    // signal actually spans onto the screen, so clamping here would saturate a
    // strong reading (pinning every gaze to the rail) and flatten the range.
    rawY,
    confidence: 1,
    hasFace: true,
    hint: null,
    quality,
    qualityHint,
    features,
    sideGaze,
    // Surfaced for the calibration readout so the eye vs. head contributions
    // are visible (and verifiable) while tuning.
    eyeVertical,
    headVertical,
  };
}
