// @vitest-environment jsdom
import { describe, it, expect } from "vitest";
import { render, screen } from "@testing-library/react";
import TrackingAura from "./TrackingAura.jsx";

describe("TrackingAura", () => {
  it("renders nothing without a level", () => {
    render(<TrackingAura level={null} />);
    expect(screen.queryByTestId("tracking-aura")).toBeNull();
  });

  it("shows the level and never intercepts clicks", () => {
    render(<TrackingAura level="orange" />);
    const el = screen.getByTestId("tracking-aura");
    expect(el.dataset.level).toBe("orange");
    expect(el.className).toMatch(/pointer-events-none/);
  });
});
