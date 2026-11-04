import { describe, it, expect } from "vitest";
import { median, stddev, trimmedMedian } from "./stats.js";

describe("stats", () => {
  it("median handles odd and even counts", () => {
    expect(median([3, 1, 2])).toBe(2);
    expect(median([4, 1, 3, 2])).toBe(2.5);
  });

  it("stddev of a constant is 0", () => {
    expect(stddev([2, 2, 2])).toBe(0);
  });

  it("trimmedMedian ignores outliers at either end", () => {
    const clean = [0.5, 0.5, 0.5, 0.5, 0.5, 0.5, 0.5, 0.5, 0.5, 0.5];
    expect(trimmedMedian([...clean.slice(2), -9, 9])).toBeCloseTo(0.5);
  });

  it("trimmedMedian of a few values falls back to the plain median", () => {
    expect(trimmedMedian([1, 2, 3])).toBe(2);
  });
});
