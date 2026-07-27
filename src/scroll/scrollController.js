/**
 * Stateful scroll controller.
 *
 * Zones (thresholds live in config.js):
 *   calibratedY < SCROLL_UP_THRESHOLD    → scroll up
 *   between the two thresholds           → neutral (dead zone for reading)
 *   calibratedY > SCROLL_DOWN_THRESHOLD  → scroll down
 *
 * Dynamic speed: maxSpeed * distance^2 * sensitivity. Because speed grows with
 *   distance from the threshold, motion already ramps up smoothly from ~0 as
 *   your gaze moves into a zone — no extra velocity momentum needed (that only
 *   caused the scroll to coast after you looked back to center).
 * Dwell: must stay in zone ≥ DWELL_MS before first scroll tick.
 * Smoothing: moving average over a ~300ms window on gaze position. The delta is
 *   scaled by elapsed time, so the controller behaves the same whether ticked
 *   at 20 or 60 FPS.
 */

import { SCROLL_UP_THRESHOLD, SCROLL_DOWN_THRESHOLD } from "../config.js";

const MAX_SPEED_PX_PER_SEC = 200;
const DWELL_MS = 250;
const SMOOTH_WINDOW = 18; // ~300ms at 60fps

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

    // Neutral zone: stop immediately (no coasting), so the page settles the
    // moment your gaze returns to the reading band.
    if (zone === "neutral") {
      return 0;
    }

    // Dwell requirement before the first scroll tick in a new zone.
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
