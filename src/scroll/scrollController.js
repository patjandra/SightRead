/**
 * Stateful scroll controller.
 *
 * Zones:
 *   calibratedY < 0.25  → scroll up
 *   0.25–0.75           → neutral (wide dead zone for comfortable reading)
 *   calibratedY > 0.75  → scroll down
 *
 * Dynamic speed: maxSpeed * distance^2 * sensitivity
 * Dwell: must stay in zone ≥ DWELL_MS before first scroll tick.
 * Smoothing: moving average over a ~300ms window at 30 FPS.
 */

const SCROLL_UP_THRESHOLD = 0.25;
const SCROLL_DOWN_THRESHOLD = 0.75;
const MAX_SPEED_PX_PER_SEC = 200;
const DWELL_MS = 250;
const SMOOTH_WINDOW = 9; // ~300ms at 30fps

export function createScrollController() {
  const gazeBuffer = [];
  let dwellStart = null;
  let lastZone = "neutral";
  let isDwelling = false;

  function getZone(y) {
    if (y < SCROLL_UP_THRESHOLD) return "up";
    if (y > SCROLL_DOWN_THRESHOLD) return "down";
    return "neutral";
  }

  function getSpeed(y, zone, sensitivity) {
    if (zone === "up") {
      const distance = (SCROLL_UP_THRESHOLD - y) / SCROLL_UP_THRESHOLD;
      return MAX_SPEED_PX_PER_SEC * distance * distance * sensitivity;
    }
    if (zone === "down") {
      const distance = (y - SCROLL_DOWN_THRESHOLD) / (1 - SCROLL_DOWN_THRESHOLD);
      return MAX_SPEED_PX_PER_SEC * distance * distance * sensitivity;
    }
    return 0;
  }


  /**
   * Push a new gaze sample and compute scroll delta.
   *
   * @param {number} calibratedY  - [0,1]
   * @param {number} deltaTimeSec - seconds since last update
   * @param {number} sensitivity  - multiplier
   * @returns {number} pixel delta to apply (negative = scroll up)
   */
  function update(calibratedY, deltaTimeSec, sensitivity) {
    // Maintain smoothing buffer
    gazeBuffer.push(calibratedY);
    if (gazeBuffer.length > SMOOTH_WINDOW) gazeBuffer.shift();

    const smoothY =
      gazeBuffer.reduce((a, b) => a + b, 0) / gazeBuffer.length;

    const zone = getZone(smoothY);
    const now = performance.now();

    if (zone !== lastZone) {
      lastZone = zone;
      dwellStart = zone === "neutral" ? null : now;
      isDwelling = false;
    }

    if (zone === "neutral") {
      return 0;
    }

    // Check dwell requirement
    if (!isDwelling) {
      if (dwellStart !== null && now - dwellStart >= DWELL_MS) {
        isDwelling = true;
      } else {
        return 0;
      }
    }

    const speed = getSpeed(smoothY, zone, sensitivity);
    const pixels = speed * deltaTimeSec;

    return zone === "up" ? -pixels : pixels;
  }

  function reset() {
    gazeBuffer.length = 0;
    dwellStart = null;
    lastZone = "neutral";
    isDwelling = false;
  }

  return { update, reset };
}
