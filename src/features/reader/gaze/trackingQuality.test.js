import { describe, it, expect } from "vitest";
import {
  assessQuality, qualityLevel, scoreFeatures, learnSweetSpot, DEFAULT_SPOT, MIN_SPOT_SAMPLES, scrollScaleForQuality,
} from "./trackingQuality.js";

// Face box from forehead/chin and cheek points; everything else at the box center.
function face({ cx = 0.5, cy = 0.5, height = 0.4, noseDx = 0 } = {}) {
  const w = height * 0.8;
  const lm = Array.from({ length: 478 }, () => ({ x: cx, y: cy, z: 0 }));
  lm[10] = { x: cx, y: cy - height / 2, z: 0 };
  lm[152] = { x: cx, y: cy + height / 2, z: 0 };
  lm[234] = { x: cx - w / 2, y: cy, z: 0 };
  lm[454] = { x: cx + w / 2, y: cy, z: 0 };
  lm[1] = { x: cx + noseDx * w, y: cy, z: 0 };
  return lm;
}

describe("assessQuality", () => {
  it("is ideal for a centered, mid-sized, frontal face", () => {
    const q = assessQuality(face());
    expect(q.score).toBe(1);
    expect(q.hint).toBeNull();
    expect(qualityLevel(q.score)).toBe("green");
  });

  it("drops as the face drifts off-center, in either direction", () => {
    const near = assessQuality(face({ cx: 0.6 })).score;
    const far = assessQuality(face({ cx: 0.75 })).score;
    expect(near).toBeLessThan(1);
    expect(far).toBeLessThan(near);
    expect(assessQuality(face({ cy: 0.25 })).hint).toBe("Center your face");
  });

  it("penalizes a face that is too small or too large, with matching hints", () => {
    expect(assessQuality(face({ height: 0.24 })).hint).toBe("Move closer");
    expect(assessQuality(face({ height: 0.8 })).hint).toBe("Move back");
  });

  it("penalizes a turned head", () => {
    const q = assessQuality(face({ noseDx: 0.2 }));
    expect(q.score).toBeLessThan(0.7);
    expect(q.hint).toBe("Face the screen");
  });

  it("is driven by the worst factor, not an average", () => {
    const bad = assessQuality(face({ cx: 0.75, height: 0.4 })).score;
    const worse = assessQuality(face({ cx: 0.75, height: 0.24 })).score;
    expect(worse).toBeLessThanOrEqual(bad);
  });
});

describe("qualityLevel", () => {
  it("maps scores to green / yellow / orange / red", () => {
    expect(qualityLevel(0.9)).toBe("green");
    expect(qualityLevel(0.6)).toBe("yellow");
    expect(qualityLevel(0.3)).toBe("orange");
    expect(qualityLevel(0.1)).toBe("red");
    expect(qualityLevel(null)).toBe("red");
  });
});

describe("learnSweetSpot", () => {
  const around = (cx, n = 40) =>
    Array.from({ length: n }, (_, i) => ({
      cx: cx + ((i % 5) - 2) * 0.01,
      cy: 0.5,
      height: 0.4,
      yaw: 0,
    }));

  it("returns null with too few readings", () => {
    expect(learnSweetSpot(around(0.5, MIN_SPOT_SAMPLES - 1))).toBeNull();
    expect(learnSweetSpot(null)).toBeNull();
  });

  it("centers the green range where the dot held steady, not on the frame middle", () => {
    const spot = learnSweetSpot(around(0.65));
    const [lo, hi] = spot.cx.free;
    expect(lo).toBeLessThan(0.65);
    expect(hi).toBeGreaterThan(0.65);
    // A face at 0.65 is green for this user but off-center for the defaults.
    const f = { cx: 0.65, cy: 0.5, height: 0.4, yaw: 0 };
    expect(scoreFeatures(f, spot).score).toBe(1);
    expect(scoreFeatures(f, DEFAULT_SPOT).score).toBeLessThan(1);
  });

  it("gets worse as the face leaves the learned range", () => {
    const spot = learnSweetSpot(around(0.5));
    const at = (cx) => scoreFeatures({ cx, cy: 0.5, height: 0.4, yaw: 0 }, spot).score;
    expect(at(0.5)).toBe(1);
    expect(at(0.7)).toBeLessThan(at(0.6));
  });

  it("never makes the green range narrower than the minimum, even for a still head", () => {
    const still = Array.from({ length: 40 }, () => ({ cx: 0.5, cy: 0.5, height: 0.4, yaw: 0 }));
    const [lo, hi] = learnSweetSpot(still).cx.free;
    expect(hi - lo).toBeGreaterThanOrEqual(0.08 - 1e-9);
  });

  it("keeps the learned range inside the framing limits", () => {
    const spot = learnSweetSpot(around(0.19));
    expect(spot.cx.free[0]).toBeGreaterThan(0.2);
  });
});

describe("scrollScaleForQuality", () => {
  it("is full speed in the green and when there is no score", () => {
    expect(scrollScaleForQuality(1)).toBe(1);
    expect(scrollScaleForQuality(0.7)).toBe(1);
    expect(scrollScaleForQuality(null)).toBe(1);
  });

  it("tapers through the yellow", () => {
    const high = scrollScaleForQuality(0.65);
    const low = scrollScaleForQuality(0.5);
    expect(high).toBeLessThan(1);
    expect(low).toBeLessThan(high);
    expect(low).toBeGreaterThan(0);
  });

  it("stops once the level is orange or red", () => {
    expect(scrollScaleForQuality(0.44)).toBe(0);
    expect(scrollScaleForQuality(0.3)).toBe(0);
    expect(scrollScaleForQuality(0)).toBe(0);
    expect(qualityLevel(0.44)).toBe("orange");
  });
});
