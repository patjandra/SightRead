// @vitest-environment jsdom
import { describe, it, expect } from "vitest";
import { renderHook } from "@testing-library/react";
import { useSmoothedQuality } from "./useSmoothedQuality.js";
import { learnSweetSpot } from "../gaze/trackingQuality.js";

const frame = (quality) => ({ quality });

function run(frames, active = true) {
  const { result, rerender } = renderHook(({ g, a }) => useSmoothedQuality(g, a), {
    initialProps: { g: frames[0], a: active },
  });
  for (const g of frames.slice(1)) rerender({ g, a: active });
  return result.current;
}

describe("useSmoothedQuality", () => {
  it("is null while inactive", () => {
    expect(run([frame(1)], false)).toBeNull();
  });

  it("stays green while quality is good", () => {
    expect(run(Array.from({ length: 10 }, () => frame(1))).level).toBe("green");
  });

  it("turns red quickly once quality is lost", () => {
    const frames = [frame(1), ...Array.from({ length: 12 }, () => frame(0))];
    expect(run(frames).level).toBe("red");
  });

  it("recovers more slowly than it degrades", () => {
    const dropped = 1 - run([frame(1), ...Array.from({ length: 5 }, () => frame(0))]).score;
    // Sink to ~0 first, then give the same five good frames.
    const sunk = [frame(1), ...Array.from({ length: 40 }, () => frame(0))];
    const gained = run([...sunk, ...Array.from({ length: 5 }, () => frame(1))]).score;
    expect(dropped).toBeGreaterThan(0.8);
    expect(gained).toBeLessThan(0.4);
  });

  it("re-scores against a learned sweet spot, but paused frames stay red", () => {
    const features = { cx: 0.7, cy: 0.5, height: 0.4, yaw: 0 };
    const spot = learnSweetSpot(
      Array.from({ length: 40 }, () => ({ ...features }))
    );
    const frames = Array.from({ length: 10 }, () => ({ quality: 0.2, features }));
    const { result, rerender } = renderHook(({ g }) => useSmoothedQuality(g, true, spot), {
      initialProps: { g: frames[0] },
    });
    for (const g of frames.slice(1)) rerender({ g });
    expect(result.current.level).toBe("green");

    for (let i = 0; i < 12; i++) rerender({ g: { quality: 0, features } });
    expect(result.current.level).toBe("red");
  });
});
