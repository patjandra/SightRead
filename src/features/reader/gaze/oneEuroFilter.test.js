import { describe, it, expect } from "vitest";
import { createOneEuroFilter } from "./oneEuroFilter.js";

const DT = 1 / 60;

describe("createOneEuroFilter", () => {
  it("passes the first sample through unchanged", () => {
    expect(createOneEuroFilter().filter(0.7, DT)).toBe(0.7);
  });

  it("converges on a steady input", () => {
    const f = createOneEuroFilter();
    f.filter(0.2, DT);
    let out;
    for (let i = 0; i < 600; i++) out = f.filter(0.8, DT);
    expect(out).toBeCloseTo(0.8, 3);
  });

  it("damps jitter at rest more than it moves the mean", () => {
    const f = createOneEuroFilter();
    let min = 1, max = 0;
    for (let i = 0; i < 300; i++) {
      const out = f.filter(0.5 + (i % 2 ? 0.05 : -0.05), DT);
      if (i > 60) { min = Math.min(min, out); max = Math.max(max, out); }
    }
    expect(max - min).toBeLessThan(0.05); // input swings 0.1 peak to peak
  });

  it("follows a fast move with less lag than a fixed-cutoff filter", () => {
    const track = (beta) => {
      const f = createOneEuroFilter({ minCutoff: 1, beta });
      f.filter(0, DT);
      let out = 0;
      for (let i = 0; i < 12; i++) out = f.filter(1, DT); // 200ms after a step
      return out;
    };
    expect(track(0.5)).toBeGreaterThan(track(0));
  });

  it("starts over after reset", () => {
    const f = createOneEuroFilter();
    f.filter(0.1, DT);
    f.reset();
    expect(f.filter(0.9, DT)).toBe(0.9);
  });
});
