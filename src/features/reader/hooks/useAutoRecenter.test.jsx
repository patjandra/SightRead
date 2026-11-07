// @vitest-environment jsdom
import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { renderHook, act } from "@testing-library/react";
import { useAutoRecenter } from "./useAutoRecenter.js";

const profile = { points: { top: 0.2, center: 0.5, bottom: 0.8 } };
const rawFor = (y) => (y <= 0.5 ? 0.2 + (y / 0.5) * 0.3 : 0.5 + ((y - 0.5) / 0.5) * 0.3);
const A = { cx: 0.5, cy: 0.5, height: 0.45, yaw: 0 };
const B = { cx: 0.5, cy: 0.62, height: 0.62, yaw: 0 };

const gaze = (rawY, features) => ({ rawY, hasFace: true, confidence: 0.9, sideGaze: 0, features });

beforeEach(() => vi.useFakeTimers({ toFake: ["performance"] }));
afterEach(() => vi.useRealTimers());

const base = { profile, manualOffset: 0, score: 0.9, enabled: true, active: true, resetKey: "a" };

// A reader sweeping down the page; `bias` and `features` describe the pose.
let clock = 0;
function drive(rerender, props, seconds, { bias = 0, features = A } = {}) {
  for (let i = 0; i < seconds * 30; i++) {
    vi.advanceTimersByTime(1000 / 30);
    clock += 1000 / 30;
    const y = 0.35 + 0.27 * (((clock / 1000) % 6) / 6);
    act(() => rerender({ ...props, gazeData: gaze(rawFor(y) + bias, features) }));
  }
}

function setup(props = base) {
  clock = 0;
  return renderHook((p) => useAutoRecenter(p), { initialProps: { ...props, gazeData: gaze(rawFor(0.5), A) } });
}

describe("useAutoRecenter", () => {
  it("stays at zero while disabled", () => {
    const { result, rerender } = setup({ ...base, enabled: false });
    drive(rerender, { ...base, enabled: false }, 20);
    drive(rerender, { ...base, enabled: false }, 16, { bias: 0.07, features: B });
    expect(result.current).toBe(0);
  });

  it("corrects after the head settles in a new pose", () => {
    const { result, rerender } = setup();
    drive(rerender, base, 20);
    expect(result.current).toBe(0);
    drive(rerender, base, 16, { bias: 0.07, features: B });
    expect(result.current).toBeGreaterThan(0.05);
  });

  it("keeps the correction while tracking is paused, and clears it when the feature is turned off", () => {
    const { result, rerender } = setup();
    drive(rerender, base, 20);
    drive(rerender, base, 16, { bias: 0.07, features: B });
    const held = result.current;
    expect(held).toBeGreaterThan(0.05);

    act(() => rerender({ ...base, active: false, gazeData: gaze(rawFor(0.5), B) }));
    expect(result.current).toBe(held);
    act(() => rerender({ ...base, active: false, gazeData: gaze(rawFor(0.5), B) }));
    expect(result.current).toBe(held);

    act(() => rerender({ ...base, enabled: false, active: false, gazeData: gaze(rawFor(0.5), B) }));
    expect(result.current).toBe(0);
  });

  it("clears the correction when the reset key changes", () => {
    const { result, rerender } = setup();
    drive(rerender, base, 20);
    drive(rerender, base, 16, { bias: 0.07, features: B });
    expect(result.current).toBeGreaterThan(0);
    act(() => rerender({ ...base, resetKey: "b", gazeData: gaze(rawFor(0.5), B) }));
    expect(result.current).toBe(0);
  });

  it("holds still on low tracking quality", () => {
    const low = { ...base, score: 0.1 };
    const { result, rerender } = setup(low);
    drive(rerender, low, 20);
    drive(rerender, low, 16, { bias: 0.07, features: B });
    expect(result.current).toBe(0);
  });
});
