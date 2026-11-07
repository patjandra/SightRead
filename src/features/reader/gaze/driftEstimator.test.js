import { describe, it, expect } from "vitest";
import { createDriftEstimator } from "./driftEstimator.js";
import { mapRawToCalibratedY } from "./calibrationManager.js";

const profile = { points: { top: 0.2, center: 0.5, bottom: 0.8 } };
const range = 0.6;
const A = { cx: 0.5, cy: 0.5, height: 0.45, yaw: 0 };
const B = { cx: 0.5, cy: 0.62, height: 0.62, yaw: 0 }; // closer and lower
const FPS = 30;

// Inverse of the profile mapping, for building raw signals from positions.
const rawFor = (y) => (y <= 0.5 ? 0.2 + (y / 0.5) * 0.3 : 0.5 + ((y - 0.5) / 0.5) * 0.3);

/** A reader with no real bias: the gaze sweeps down the page, then it scrolls back. */
const sweep = (lo = 0.35, hi = 0.62, sec = 6) => (ms) => rawFor(lo + (hi - lo) * (((ms / 1000) % sec) / sec));

/** Feeds `seconds` of frames; `raw(t)` is the true raw signal, `bias` shifts it. */
function run(est, startMs, seconds, raw, { bias = 0, ...over } = {}) {
  let last;
  for (let i = 0; i < seconds * FPS; i++) {
    const t = startMs + (i * 1000) / FPS;
    const rawY = raw(t) + (typeof bias === "function" ? bias(t) : bias);
    last = est.update({
      t, rawY, calibratedY: mapRawToCalibratedY(rawY, profile, est.offset),
      usable: true, score: 0.9, features: { ...A }, range, ...over,
    });
  }
  return { end: startMs + seconds * 1000, last };
}

describe("createDriftEstimator", () => {
  it("does not mistake a reader's sweep for drift (zero real bias stays zero)", () => {
    for (const [lo, hi] of [[0.4, 0.62], [0.35, 0.62], [0.3, 0.6], [0.45, 0.65]]) {
      const est = createDriftEstimator();
      run(est, 0, 300, sweep(lo, hi));
      expect(Math.abs(est.offset)).toBeLessThan(0.005);
    }
  });

  it("measures the shift when the head settles in a new pose, sweep and all", () => {
    const est = createDriftEstimator();
    const raw = sweep();
    let { end } = run(est, 0, 20, raw);
    // Move to pose B, where the whole signal is shifted by +0.07.
    ({ end } = run(est, end, 16, raw, { bias: 0.07, features: { ...B } }));
    expect(est.offset).toBeGreaterThan(0.06);
    expect(est.offset).toBeLessThan(0.08);
  });

  it("does nothing about a constant error that is there from the start", () => {
    const est = createDriftEstimator();
    run(est, 0, 120, sweep(), { bias: 0.1 });
    expect(est.offset).toBe(0);
  });

  it("eases the correction in rather than jumping", () => {
    const est = createDriftEstimator();
    const raw = sweep();
    let { end } = run(est, 0, 20, raw);
    let biggestStep = 0;
    let prev = 0;
    for (let i = 0; i < 16 * FPS; i++) {
      const t = end + (i * 1000) / FPS;
      const rawY = raw(t) + 0.07;
      est.update({ t, rawY, calibratedY: mapRawToCalibratedY(rawY, profile, est.offset), usable: true, score: 0.9, features: { ...B }, range });
      biggestStep = Math.max(biggestStep, Math.abs(est.offset - prev));
      prev = est.offset;
    }
    expect(prev).toBeGreaterThan(0.06);
    expect(biggestStep).toBeLessThan(0.005); // rate * range / fps = 0.002
  });

  it("ignores the first moments after Start tracking when building the baseline", () => {
    const est = createDriftEstimator();
    const raw = sweep();
    // The first 2 s the gaze is on the sidebar, far from the page.
    let { end } = run(est, 0, 2, () => rawFor(0.12));
    ({ end } = run(est, end, 18, raw));
    ({ end } = run(est, end, 16, raw, { bias: 0.07, features: { ...B } }));
    expect(est.offset).toBeGreaterThan(0.06);
    expect(est.offset).toBeLessThan(0.08);
  });

  it("ignores frames of poor quality or unusable ones", () => {
    const raw = sweep();
    for (const bad of [{ score: 0.2 }, { usable: false }]) {
      const est = createDriftEstimator();
      let { end } = run(est, 0, 20, raw);
      ({ end } = run(est, end, 16, raw, { bias: 0.07, features: { ...B }, ...bad }));
      expect(est.offset).toBe(0);
    }
  });

  it("does not learn from saturated readings at the ends of the screen", () => {
    const est = createDriftEstimator();
    let { end } = run(est, 0, 20, sweep());
    ({ end } = run(est, end, 16, () => rawFor(0.99), { features: { ...B } }));
    expect(est.offset).toBe(0);
  });

  it("does not act while the head keeps moving", () => {
    const est = createDriftEstimator();
    const raw = sweep();
    let { end } = run(est, 0, 20, raw);
    let t = end;
    for (let i = 0; i < 20 * FPS; i++, t += 1000 / FPS) {
      const rawY = raw(t) + 0.07;
      est.update({
        t, rawY, calibratedY: mapRawToCalibratedY(rawY, profile, est.offset), usable: true, score: 0.9,
        features: { cx: 0.5 + 0.09 * Math.sin(i / 3), cy: 0.5 + 0.1 * Math.cos(i / 4), height: 0.45, yaw: 0 }, range,
      });
    }
    expect(est.offset).toBe(0);
  });

  it("ignores a shift too small to matter", () => {
    const est = createDriftEstimator();
    const raw = sweep();
    let { end } = run(est, 0, 20, raw);
    run(est, end, 16, raw, { bias: 0.008, features: { ...B } });
    expect(est.offset).toBe(0);
  });

  it("never corrects beyond the clamp", () => {
    const est = createDriftEstimator();
    const raw = sweep();
    let { end } = run(est, 0, 20, raw);
    run(est, end, 40, raw, { bias: 0.2, features: { ...B } });
    expect(est.offset).toBeLessThanOrEqual(0.12 * range + 1e-9);
    expect(est.offset).toBeGreaterThan(0.06);
  });

  it("pause keeps the correction, and a move made while paused is measured on resume", () => {
    const est = createDriftEstimator();
    const raw = sweep();
    let { end } = run(est, 0, 20, raw);
    ({ end } = run(est, end, 16, raw, { bias: 0.04, features: { ...B } }));
    const held = est.offset;
    expect(held).toBeGreaterThan(0.03);

    est.pause();
    expect(est.offset).toBe(held);

    // Resume in a third pose C, with a further +0.05 on top of B's.
    const C = { cx: 0.5, cy: 0.38, height: 0.3, yaw: 0 };
    run(est, end + 60_000, 16, raw, { bias: 0.09, features: { ...C } });
    expect(est.offset).toBeGreaterThan(held + 0.03);
  });

  it("reset clears the correction and the baseline", () => {
    const est = createDriftEstimator();
    const raw = sweep();
    let { end } = run(est, 0, 20, raw);
    ({ end } = run(est, end, 16, raw, { bias: 0.07, features: { ...B } }));
    expect(est.offset).not.toBe(0);
    est.reset();
    expect(est.offset).toBe(0);
    // With the baseline gone, the same move is not measured.
    ({ end } = run(est, end + 1000, 1, raw));
    run(est, end, 16, raw, { bias: 0.14, features: { ...A } });
    expect(est.offset).toBe(0);
  });

  it("does not let readings taken while the head is moving contaminate the baseline", () => {
    const est = createDriftEstimator();
    const raw = sweep();
    let { end } = run(est, 0, 10, raw);
    // 6 s of small head movement (moving, but well inside the same pose) with
    // wild readings that must not count.
    let t = end;
    for (let i = 0; i < 6 * FPS; i++, t += 1000 / FPS) {
      const rawY = rawFor(0.85);
      est.update({
        t, rawY, calibratedY: mapRawToCalibratedY(rawY, profile, est.offset), usable: true, score: 0.9,
        features: { ...A, cx: 0.5 + 0.04 * Math.sin(i / 2) }, range,
      });
    }
    ({ end } = run(est, t, 8, raw));
    ({ end } = run(est, end, 16, raw, { bias: 0.07, features: { ...B } }));
    expect(est.offset).toBeGreaterThan(0.06);
    expect(est.offset).toBeLessThan(0.08);
  });

  it("reports a grace period right after Start tracking", () => {
    const est = createDriftEstimator();
    const { last } = run(est, 0, 1.5, sweep());
    expect(last.mode).toBe("grace");
    expect(run(est, 1500, 3, sweep()).last.mode).not.toBe("grace");
  });
});
