/**
 * Stateful scroll controller.
 *
 * Zones (thresholds live in config.js):
 *   calibratedY < zones.up    → scroll up
 *   between the two           → neutral (dead zone for reading)
 *   calibratedY > zones.down  → scroll down
 * The zones widen as the page is zoomed in and the speed scales with zoom, so
 * the page moves a similar number of music lines per second at any zoom.
 *
 * Dynamic speed: maxSpeed * (floor + distance^2) * sensitivity. Speed starts at a
 *   small floor as your gaze enters a zone and grows with distance from the
 *   threshold — no extra velocity momentum needed (that only caused the scroll
 *   to coast after you looked back to center).
 * Dwell: must stay in zone ≥ DWELL_MS before first scroll tick.
 * Smoothing: One Euro filter on gaze position — steady at rest, quick to follow a
 *   real move. The delta is scaled by elapsed time, so the controller behaves
 *   the same whether ticked at 20 or 60 FPS.
 */

import {
  scrollZones,
  GAZE_FILTER_MIN_CUTOFF,
  GAZE_FILTER_BETA,
  GAP_HOLD_MS,
} from "../../../config.js";
import { createOneEuroFilter } from "../gaze/oneEuroFilter.js";

const MAX_SPEED_PX_PER_SEC = 200;
const DWELL_MS = 250;
// Speed never drops below this fraction of the maximum once a zone is entered.
// The squared ramp alone gives almost no motion just past a threshold, so a gaze
// that barely clears it looked like "not scrolling".
const MIN_SPEED_FRACTION = 0.2;

export function createScrollController() {
  const smoother = createOneEuroFilter({
    minCutoff: GAZE_FILTER_MIN_CUTOFF,
    beta: GAZE_FILTER_BETA,
  });
  let dwellStart = null;
  let lastZone = "neutral";
  let isDwelling = false;
  let gapStart = null;

  function getZone(y, zones) {
    if (y < zones.up) return "up";
    if (y > zones.down) return "down";
    return "neutral";
  }

  // Fraction of max speed for a 0–1 distance into the zone: a floor, then a squared ramp.
  function rampSpeed(distance) {
    return MIN_SPEED_FRACTION + (1 - MIN_SPEED_FRACTION) * distance * distance;
  }

  function getSpeed(y, zone, zones, sensitivity, zoom) {
    const max = MAX_SPEED_PX_PER_SEC * sensitivity * zoom;
    if (zone === "up") {
      const distance = (zones.up - y) / zones.up;
      return max * rampSpeed(distance);
    }
    if (zone === "down") {
      const distance = (y - zones.down) / (1 - zones.down);
      return max * rampSpeed(distance);
    }
    return 0;
  }


  /**
   * Push a new gaze sample and compute scroll delta.
   *
   * @param {number} calibratedY  - [0,1]
   * @param {number} deltaTimeSec - seconds since last update
   * @param {number} sensitivity  - multiplier
 * @param {number} [zoom]        - page zoom factor (1 = 100%)
   * @returns {number} pixel delta to apply (negative = scroll up)
   */
  function update(calibratedY, deltaTimeSec, sensitivity, zoom = 1) {
    gapStart = null;
    const smoothY = smoother.filter(calibratedY, deltaTimeSec);

    const zones = scrollZones(zoom);
    const zone = getZone(smoothY, zones);
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

    const speed = getSpeed(smoothY, zone, zones, sensitivity, zoom);
    const pixels = speed * deltaTimeSec;

    return zone === "up" ? -pixels : pixels;
  }

  /**
   * Tracking dropped out this frame (blink, missed face). Scrolling pauses, but
   * the filter and dwell state survive a short gap so a blink doesn't restart
   * the dwell; a longer gap resets everything.
   *
   * @returns {0}
   */
  function pause() {
    const now = performance.now();
    if (gapStart === null) gapStart = now;
    else if (now - gapStart > GAP_HOLD_MS) reset();
    return 0;
  }

  function reset() {
    gapStart = null;
    smoother.reset();
    dwellStart = null;
    lastZone = "neutral";
    isDwelling = false;
  }

  return { update, pause, reset };
}
