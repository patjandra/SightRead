import { describe, it, expect } from "vitest";
import { estimateGaze } from "./gazeEstimator.js";

// ─── Test fixtures ───────────────────────────────────────────────────────────
// Build a well-framed 478-point landmark set: everything at center except the
// forehead (#10) and chin (#152), which set the vertical extent (and the head
// pitch via their z depth). This passes assessFraming (centered, in-frame,
// reasonable height) so the blendshape path is exercised.
function makeLandmarks({ foreheadZ = 0, chinZ = 0 } = {}) {
  const lm = Array.from({ length: 478 }, () => ({ x: 0.5, y: 0.5, z: 0 }));
  lm[10] = { x: 0.5, y: 0.3, z: foreheadZ }; // forehead (top of the face box)
  lm[152] = { x: 0.5, y: 0.7, z: chinZ }; // chin (bottom of the face box)
  return lm;
}

// Turn a sparse {name: score} map into MediaPipe's category array shape. Always
// includes a baseline entry so the array is non-empty (an empty categories array
// signals "blendshapes unavailable" to the estimator, a different code path).
function makeBlendshapes(scores = {}) {
  const merged = { _neutral: 0, ...scores };
  return {
    categories: Object.entries(merged).map(([categoryName, score]) => ({
      categoryName,
      score,
    })),
  };
}

function makeResult({ landmarks = makeLandmarks(), scores = {} } = {}) {
  return {
    faceLandmarks: [landmarks],
    faceBlendshapes: [makeBlendshapes(scores)],
  };
}

// ─── Tests ───────────────────────────────────────────────────────────────────

describe("estimateGaze — presence & framing", () => {
  it("reports no face for a null / empty result", () => {
    const g = estimateGaze(null);
    expect(g.hasFace).toBe(false);
    expect(g.confidence).toBe(0);
    expect(g.hint).toBeTruthy();
  });

  it("pauses with a hint when the face is cut off by the frame edge", () => {
    const lm = makeLandmarks();
    lm[0] = { x: 0.005, y: 0.5, z: 0 }; // a point hard against the left edge
    const g = estimateGaze(makeResult({ landmarks: lm }));
    expect(g.hasFace).toBe(true);
    expect(g.confidence).toBe(0);
    expect(g.hint).toMatch(/face/i);
  });
});

describe("estimateGaze — vertical gaze blend", () => {
  it("rests at ~0.5 looking straight ahead (no eye or head signal)", () => {
    const g = estimateGaze(makeResult());
    expect(g.hasFace).toBe(true);
    expect(g.confidence).toBe(1);
    expect(g.rawY).toBeCloseTo(0.5, 3);
    expect(g.eyeVertical).toBeCloseTo(0, 3);
    expect(g.headVertical).toBeCloseTo(0, 3);
  });

  it("moves rawY above 0.5 when the eyes look down", () => {
    const g = estimateGaze(
      makeResult({ scores: { eyeLookDownLeft: 0.2, eyeLookDownRight: 0.2 } })
    );
    expect(g.eyeVertical).toBeGreaterThan(0);
    expect(g.rawY).toBeGreaterThan(0.5);
  });

  it("moves rawY below 0.5 when the eyes look up", () => {
    const g = estimateGaze(
      makeResult({ scores: { eyeLookUpLeft: 0.2, eyeLookUpRight: 0.2 } })
    );
    expect(g.eyeVertical).toBeLessThan(0);
    expect(g.rawY).toBeLessThan(0.5);
  });

  it("adds head pitch: tilting the chin away (looking down) raises rawY", () => {
    // chin farther from camera (z larger) than forehead => looking down.
    const g = estimateGaze(makeResult({ landmarks: makeLandmarks({ foreheadZ: 0, chinZ: 0.1 }) }));
    expect(g.headVertical).toBeGreaterThan(0);
    expect(g.rawY).toBeGreaterThan(0.5);
  });

  it("does NOT clamp rawY to [0,1] (strong signal must stay separable)", () => {
    const g = estimateGaze(
      makeResult({ scores: { eyeLookDownLeft: 1, eyeLookDownRight: 1 } })
    );
    // eyeVertical = 1, *EYE_GAIN(3) => vertical 3 => rawY = 0.5 + 1.5 = 2.0
    expect(g.rawY).toBeGreaterThan(1);
  });
});

describe("estimateGaze — gates", () => {
  it("drops confidence to 0 during a blink", () => {
    const g = estimateGaze(makeResult({ scores: { eyeBlinkLeft: 0.6 } }));
    expect(g.hasFace).toBe(true);
    expect(g.confidence).toBe(0);
  });

  it("exposes sideGaze so calibration can reject sideways glances", () => {
    const g = estimateGaze(
      makeResult({ scores: { eyeLookOutLeft: 0.4, eyeLookOutRight: 0.4 } })
    );
    expect(g.sideGaze).toBeGreaterThan(0);
  });
});

describe("estimateGaze — quality", () => {
  it("reports full quality for a well-framed face", () => {
    expect(estimateGaze(makeResult()).quality).toBe(1);
  });

  it("reports zero quality with no face or when framing pauses tracking", () => {
    expect(estimateGaze(null).quality).toBe(0);
    const lm = makeLandmarks();
    lm[0] = { x: 0.005, y: 0.5, z: 0 };
    expect(estimateGaze(makeResult({ landmarks: lm })).quality).toBe(0);
  });
});

describe("estimateGaze — head tilt with a fixed gaze", () => {
  it("cancels: tilting the head up while the eyes roll down to stay on the same spot", () => {
    // Head tilted up by 30 degrees: head term -0.5. The eyes roll down inside the
    // head to keep looking at the same spot: eye term +0.5. Net gaze is unchanged.
    const lm = makeLandmarks({ foreheadZ: 0.2309, chinZ: 0 });
    const g = estimateGaze(
      makeResult({ landmarks: lm, scores: { eyeLookDownLeft: 0.5, eyeLookDownRight: 0.5 } })
    );
    expect(g.headVertical).toBeCloseTo(-0.5, 2);
    expect(g.eyeVertical).toBeCloseTo(0.5, 5);
    expect(g.rawY).toBeCloseTo(0.5, 2);
  });
});
