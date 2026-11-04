import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { createScrollController } from "./scrollController.js";
import { SCROLL_UP_THRESHOLD, SCROLL_DOWN_THRESHOLD } from "../../../config.js";

// The controller reads performance.now() for its dwell timer, so we drive time
// manually to make the dwell behavior deterministic.
let clock;
beforeEach(() => {
  clock = 1000;
  vi.spyOn(performance, "now").mockImplementation(() => clock);
});
afterEach(() => vi.restoreAllMocks());

const DT = 0.016; // ~one 60fps frame

// Look at a target zone, wait out the dwell, then return the next delta.
function scrollAfterDwell(controller, y) {
  controller.update(y, DT, 1); // first frame in-zone starts the dwell timer
  clock += 300; // exceed DWELL_MS (250)
  return controller.update(y, DT, 1);
}

describe("scrollController zones", () => {
  it("returns 0 in the neutral dead zone (no scrolling while reading)", () => {
    const c = createScrollController();
    const mid = (SCROLL_UP_THRESHOLD + SCROLL_DOWN_THRESHOLD) / 2;
    expect(c.update(mid, DT, 1)).toBe(0);
  });

  it("scrolls down (positive delta) when gaze is below the down threshold", () => {
    const c = createScrollController();
    expect(scrollAfterDwell(c, 0.95)).toBeGreaterThan(0);
  });

  it("scrolls up (negative delta) when gaze is above the up threshold", () => {
    const c = createScrollController();
    expect(scrollAfterDwell(c, 0.05)).toBeLessThan(0);
  });
});

describe("scrollController dwell", () => {
  it("does not scroll until the dwell time has elapsed", () => {
    const c = createScrollController();
    expect(c.update(0.95, DT, 1)).toBe(0); // first frame: dwell starts
    clock += 100; // still under DWELL_MS
    expect(c.update(0.95, DT, 1)).toBe(0);
    clock += 300; // now past DWELL_MS
    expect(c.update(0.95, DT, 1)).toBeGreaterThan(0);
  });

  it("settles to a full stop at neutral, with no momentum coasting", () => {
    const c = createScrollController();
    scrollAfterDwell(c, 0.95); // scrolling down
    // Feed neutral gaze until the smoothing window clears the down zone; once
    // neutral, the delta must be exactly 0 (no decaying coast / momentum).
    let last = null;
    for (let i = 0; i < 20; i++) last = c.update(0.5, DT, 1);
    expect(last).toBe(0);
  });
});

describe("scrollController speed", () => {
  it("scales scroll speed with sensitivity", () => {
    const slow = createScrollController();
    const dSlow = scrollAfterDwell(slow, 0.95);

    const fast = createScrollController();
    fast.update(0.95, DT, 2); // start this controller's own dwell
    clock += 300;
    const dFast = fast.update(0.95, DT, 2);

    expect(dFast).toBeCloseTo(dSlow * 2, 5);
  });

  it("moves faster the further gaze is from the threshold (quadratic ramp)", () => {
    const near = createScrollController();
    const far = createScrollController();
    const dNear = scrollAfterDwell(near, 0.7); // just past down threshold
    const dFar = scrollAfterDwell(far, 0.99); // deep into the down zone
    expect(Math.abs(dFar)).toBeGreaterThan(Math.abs(dNear));
  });

  it("is time-scaled: a longer frame moves proportionally more", () => {
    const c = createScrollController();
    c.update(0.95, DT, 1);
    clock += 300;
    const oneFrame = c.update(0.95, DT, 1);
    const twoFrame = c.update(0.95, DT * 2, 1);
    expect(twoFrame).toBeCloseTo(oneFrame * 2, 5);
  });
});

describe("scrollController dropouts", () => {
  it("keeps the dwell state through a short gap (a blink)", () => {
    const c = createScrollController();
    scrollAfterDwell(c, 0.95); // dwelling, scrolling
    c.pause();
    clock += 100; // under GAP_HOLD_MS
    expect(c.pause()).toBe(0);
    expect(c.update(0.95, DT, 1)).toBeGreaterThan(0); // no new dwell wait
  });

  it("forgets the dwell after a long gap", () => {
    const c = createScrollController();
    scrollAfterDwell(c, 0.95);
    c.pause();
    clock += 100;
    c.pause();
    clock += 400; // total gap now over GAP_HOLD_MS
    c.pause();
    expect(c.update(0.95, DT, 1)).toBe(0); // dwell starts over
  });
});
