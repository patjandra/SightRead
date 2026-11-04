/**
 * One Euro filter (Casiez et al., 2012): a low-pass filter whose cutoff rises
 * with the signal's speed. At rest it smooths hard, which hides jitter; when the
 * gaze moves quickly the cutoff opens up, so it follows with little lag. It is
 * time-based, so it behaves the same at 20 or 60 fps.
 *
 * @param {{ minCutoff?: number, beta?: number, dCutoff?: number }} [options]
 *   minCutoff — Hz, smoothing at rest (lower = steadier but laggier)
 *   beta      — how fast the cutoff opens as the signal speeds up
 *   dCutoff   — Hz, smoothing of the speed estimate itself
 */
export function createOneEuroFilter({ minCutoff = 1, beta = 0.02, dCutoff = 1 } = {}) {
  let prev = null;
  let prevDx = 0;

  const alphaFor = (cutoff, dt) => {
    const tau = 1 / (2 * Math.PI * cutoff);
    return 1 / (1 + tau / dt);
  };

  /**
   * @param {number} value - new sample
   * @param {number} dt    - seconds since the previous sample
   * @returns {number} filtered value
   */
  function filter(value, dt) {
    // The first sample, or a sample with no elapsed time, has nothing to smooth against.
    if (prev === null || !(dt > 0)) {
      if (prev === null) prev = value;
      return prev;
    }
    const dx = (value - prev) / dt;
    prevDx += alphaFor(dCutoff, dt) * (dx - prevDx);
    const cutoff = minCutoff + beta * Math.abs(prevDx);
    prev += alphaFor(cutoff, dt) * (value - prev);
    return prev;
  }

  function reset() {
    prev = null;
    prevDx = 0;
  }

  return { filter, reset };
}
