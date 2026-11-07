// @vitest-environment jsdom
import React from "react";
import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { render, act, cleanup } from "@testing-library/react";
import RecenterScreen from "./RecenterScreen.jsx";
import { mapRawToCalibratedY } from "../gaze/calibrationManager.js";
import { SCROLL_UP_THRESHOLD, SCROLL_DOWN_THRESHOLD, SCROLL_BAND_CENTER } from "../../../config.js";

const profile = { points: { top: 0.2, center: 0.5, bottom: 0.9 } };
const frame = (rawY) => ({ rawY, hasFace: true, confidence: 0.9, sideGaze: 0 });

beforeEach(() => vi.useFakeTimers({ toFake: ["setTimeout", "clearTimeout", "performance"] }));
afterEach(() => {
  cleanup();
  vi.useRealTimers();
});

// Looking at the dot with a raw reading of `rawY` for ~2 s of frames.
function recenterWith(rawY) {
  const onDone = vi.fn();
  const { rerender } = render(<RecenterScreen gazeData={frame(rawY)} profile={profile} onDone={onDone} />);
  act(() => vi.advanceTimersByTime(900)); // lead-in
  for (let i = 0; i < 90 && !onDone.mock.calls.length; i++) {
    act(() => vi.advanceTimersByTime(34));
    act(() => rerender(<RecenterScreen gazeData={{ ...frame(rawY) }} profile={profile} onDone={onDone} />));
  }
  return onDone;
}

describe("RecenterScreen", () => {
  it("puts a resting gaze in the middle of the no-scroll band, equally far from both edges", () => {
    const rawLookingAtDot = 0.43; // drifted away from the saved center of 0.5
    const onDone = recenterWith(rawLookingAtDot);
    expect(onDone).toHaveBeenCalledTimes(1);
    const offset = onDone.mock.calls[0][0];

    const resting = mapRawToCalibratedY(rawLookingAtDot, profile, offset);
    expect(resting).toBeCloseTo(SCROLL_BAND_CENTER, 3);
    expect(resting - SCROLL_UP_THRESHOLD).toBeCloseTo(SCROLL_DOWN_THRESHOLD - resting, 3);
  });

  it("does not use the calibrated 0.5, which sits near the scroll-up edge", () => {
    const onDone = recenterWith(0.5);
    const offset = onDone.mock.calls[0][0];
    expect(mapRawToCalibratedY(0.5, profile, offset)).toBeGreaterThan(0.53);
  });
});
