// @vitest-environment jsdom
import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { render, screen, fireEvent, cleanup } from "@testing-library/react";
import CalibrationCheck, { GREEN_ZONE_READINGS } from "./CalibrationCheck.jsx";

let clock;
beforeEach(() => {
  clock = 1000;
  vi.spyOn(performance, "now").mockImplementation(() => clock);
});
afterEach(() => {
  cleanup();
  vi.restoreAllMocks();
});

const points = { top: 0, center: 0.5, bottom: 1 };
const features = { cx: 0.5, cy: 0.5, height: 0.4, yaw: 0 };
// rawY 0.5 maps to the middle of the screen (neutral band); 0.95 maps well into the scroll-down zone.
const frame = (rawY) => ({ rawY, confidence: 1, hasFace: true, sideGaze: 0.1, features: { ...features } });

function setup(rawY, frames = 1) {
  const onAccept = vi.fn();
  const ui = (g) => <CalibrationCheck gazeData={g} points={points} onAccept={onAccept} onRedo={() => {}} onCancel={() => {}} />;
  const view = render(ui(frame(rawY)));
  for (let i = 1; i < frames; i++) view.rerender(ui(frame(rawY)));
  return { onAccept };
}

describe("CalibrationCheck green zone", () => {
  it("counts readings only while the dot is in the central band", () => {
    setup(0.5, 12);
    expect(screen.getByText(`12 / ${GREEN_ZONE_READINGS} readings`)).toBeTruthy();
    cleanup();
    setup(0.95, 12); // dot in the scroll-down zone: nothing counts
    expect(screen.getByText(`0 / ${GREEN_ZONE_READINGS} readings`)).toBeTruthy();
  });

  it("locks Looks good until the ring is full, then hands back the learned zone", () => {
    const { onAccept } = setup(0.5, GREEN_ZONE_READINGS - 1);
    const btn = screen.getByText("Looks good");
    expect(btn.disabled).toBe(true);
    cleanup();

    const full = setup(0.5, GREEN_ZONE_READINGS);
    const ok = screen.getByText("Looks good");
    expect(ok.disabled).toBe(false);
    fireEvent.click(ok);
    expect(full.onAccept).toHaveBeenCalledTimes(1);
    expect(full.onAccept.mock.calls[0][0].cx.free[0]).toBeLessThan(0.5);
    expect(onAccept).not.toHaveBeenCalled();
  });

  it("skip accepts with no learned zone, so the default is used", () => {
    const { onAccept } = setup(0.5, 3);
    fireEvent.click(screen.getByText(/Skip/));
    expect(onAccept).toHaveBeenCalledWith(null);
  });

  it("stops counting past the target", () => {
    setup(0.5, GREEN_ZONE_READINGS + 20);
    expect(screen.getByText(`${GREEN_ZONE_READINGS} / ${GREEN_ZONE_READINGS} readings`)).toBeTruthy();
  });

  it("starts over when the dot leaves the central band, and doesn't reset on a blink", () => {
    const onAccept = vi.fn();
    const ui = (g) => <CalibrationCheck gazeData={g} points={points} onAccept={onAccept} onRedo={() => {}} onCancel={() => {}} />;
    const view = render(ui(frame(0.5)));
    for (let i = 0; i < 20; i++) view.rerender(ui(frame(0.5)));
    expect(screen.getByText(`21 / ${GREEN_ZONE_READINGS} readings`)).toBeTruthy();

    // A blink (no confident reading) leaves the progress alone.
    view.rerender(ui({ ...frame(0.5), confidence: 0 }));
    expect(screen.getByText(`21 / ${GREEN_ZONE_READINGS} readings`)).toBeTruthy();

    // Looking down into the scroll-down zone resets it.
    for (let i = 0; i < 4; i++) {
      clock += 400;
      view.rerender(ui(frame(0.95)));
    }
    expect(screen.getByText(`0 / ${GREEN_ZONE_READINGS} readings`)).toBeTruthy();
  });
});
