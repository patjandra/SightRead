import { AUTO_RECENTER } from "../../../config.js";
import { median } from "./stats.js";

const MAX_DT_SEC = 0.1;
// Smoothing of the face pose used to tell "moving" from "settled in a new place".
const POSE_ALPHA = 0.1;
// Frame-to-frame wander (in pose units) beyond which the head counts as moving.
const POSE_MOVING = 0.25;
// Once the head has been seen moving it stays "moving" this much longer, so a
// wobbling head doesn't slip frames through each time it crosses its mean.
const MOVING_HOLD_MS = 400;

const POSE_KEYS = ["cx", "cy", "height", "yaw"];

function poseDistance(a, b, unit) {
  let worst = 0;
  for (const k of POSE_KEYS) worst = Math.max(worst, Math.abs(a[k] - b[k]) / unit[k]);
  return worst;
}

/**
 * Follows the pose-dependent error in the raw gaze signal without asking the
 * user to look at a dot.
 *
 * It does NOT assume the gaze should sit at the center of the screen: a reader
 * who reads down the page and is then scrolled back up has a median gaze above
 * the center even with perfect tracking, and "correcting" that is the bug this
 * design replaced. Instead it compares the user with themselves. While the head
 * is settled it keeps a median of recent raw readings (the baseline). When the
 * head settles somewhere new, it measures the median again and applies the
 * difference as the offset, because the reading behavior is the same in both
 * windows and only the pose changed.
 *
 * It does nothing until a baseline exists, so an error already present when
 * tracking starts is left to the explicit Recenter. Frames that are low quality,
 * taken while the head is moving, or saturated at the ends of the screen are
 * ignored. The correction is eased in, clamped, and kept across a tracking pause
 * (`pause()`); `reset()` clears it.
 *
 * Work in raw units: `offset` is subtracted from the raw signal like the manual
 * recenter offset.
 *
 * @param {Partial<typeof AUTO_RECENTER>} [overrides]
 */
export function createDriftEstimator(overrides = {}) {
  const cfg = { ...AUTO_RECENTER, ...overrides };

  let offset = 0; // applied
  let goal = 0; // where the applied offset is heading
  let startedAt = null;
  let lastT = null;
  let pose = null; // smoothed face features
  let anchor = null; // pose the baseline was taken in
  let stillSince = null;
  let movingUntil = -Infinity;
  let baseline = null; // median raw reading in the anchor pose
  let ref = []; // { t, raw } accepted readings in the anchor pose
  let post = null; // { t0, samples } while measuring a new pose

  // Tracking paused: the correction and the baseline survive, so a move made
  // while paused is measured against the pose it came from. The timers restart.
  function pause() {
    startedAt = null;
    lastT = null;
    pose = null;
    stillSince = null;
    movingUntil = -Infinity;
    ref = [];
    post = null;
  }

  function reset() {
    pause();
    offset = 0;
    goal = 0;
    anchor = null;
    baseline = null;
  }

  /**
   * @param {object} f
   * @param {number} f.t - time in ms
   * @param {number} f.rawY - raw signal with the manual offset already removed
   * @param {number|null} f.calibratedY - rawY mapped with the current auto offset
   * @param {boolean} f.usable - confident face, eyes not turned sideways
   * @param {number} f.score - smoothed tracking quality 0..1
   * @param {object|null} f.features - face measurements
   * @param {number} f.range - raw span (bottom - top) of the profile
   * @returns {{ offset: number, mode: "grace"|"watching"|"measuring" }}
   */
  function update({ t, rawY, calibratedY, usable, score, features, range }) {
    if (startedAt === null) startedAt = t;
    const dt = lastT === null ? 0 : Math.min(MAX_DT_SEC, Math.max(0, (t - lastT) / 1000));
    lastT = t;

    // Ease the applied offset toward its goal.
    if (offset !== goal && range > 0) {
      const step = cfg.rate * range * dt;
      offset += Math.max(-step, Math.min(step, goal - offset));
    }

    // Track the head pose, whatever the frame's quality.
    let moving = false;
    if (features) {
      if (!pose) {
        pose = { ...features };
      } else {
        if (poseDistance(features, pose, cfg.poseUnit) > POSE_MOVING) movingUntil = t + MOVING_HOLD_MS;
        moving = t < movingUntil;
        for (const k of POSE_KEYS) pose[k] += (features[k] - pose[k]) * POSE_ALPHA;
      }
      if (moving) stillSince = null;
      else if (stillSince === null) stillSince = t;
    }

    if (t - startedAt < cfg.graceMs) return { offset, mode: "grace" };

    const [lo, hi] = cfg.captureWindow;
    const accept =
      usable && score >= cfg.minQuality && !moving && calibratedY !== null && calibratedY >= lo && calibratedY <= hi;
    const settled = pose && stillSince !== null && t - stillSince >= cfg.poseHoldMs;
    const away = pose && anchor ? poseDistance(pose, anchor, cfg.poseUnit) > cfg.poseShift : false;

    // Measuring a new pose: gather readings until there are enough, then compare.
    if (post) {
      if (!pose || moving || (anchor && poseDistance(pose, post.pose, cfg.poseUnit) > cfg.poseShift / 2)) {
        post = null; // the head moved again; wait for it to settle
      } else {
        if (accept) post.samples.push({ t, raw: rawY });
        if (t - post.t0 >= cfg.measureMs && post.samples.length >= cfg.minSamples) {
          const after = median(post.samples.map((s) => s.raw));
          if (baseline !== null && range > 0) {
            const shift = after - baseline;
            if (Math.abs(shift) > cfg.deadBand * range) {
              const limit = cfg.maxOffset * range;
              goal = Math.max(-limit, Math.min(limit, goal + shift));
            }
          }
          baseline = after;
          anchor = { ...pose };
          ref = post.samples;
          post = null;
        }
        return { offset, mode: "measuring" };
      }
    }

    if (settled && (!anchor || away)) {
      if (!anchor) {
        anchor = { ...pose }; // the first settled pose is the reference
      } else {
        post = { t0: t, pose: { ...pose }, samples: [] };
        return { offset, mode: "measuring" };
      }
    }

    // Still in the anchor pose: keep the baseline current.
    if (accept && anchor && !away) {
      ref.push({ t, raw: rawY });
      const keepFrom = t - cfg.baselineMs;
      while (ref.length && ref[0].t < keepFrom) ref.shift();
      if (ref.length >= cfg.minSamples) baseline = median(ref.map((s) => s.raw));
    }
    return { offset, mode: "watching" };
  }

  return { update, pause, reset, get offset() { return offset; } };
}
