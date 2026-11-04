import { describe, it, expect } from "vitest";
import { scrollZones, SCROLL_UP_THRESHOLD, SCROLL_DOWN_THRESHOLD } from "./config.js";

describe("scrollZones", () => {
  it("matches the base thresholds at 100% zoom", () => {
    const z = scrollZones(1);
    expect(z.up).toBeCloseTo(SCROLL_UP_THRESHOLD);
    expect(z.down).toBeCloseTo(SCROLL_DOWN_THRESHOLD);
  });

  it("keeps the same center and widens as zoom grows", () => {
    const a = scrollZones(1), b = scrollZones(2);
    expect((b.up + b.down) / 2).toBeCloseTo((a.up + a.down) / 2);
    expect(b.down - b.up).toBeGreaterThan(a.down - a.up);
  });

  it("never narrows below the base zones, so a resting gaze stays neutral when zoomed out", () => {
    for (const zoom of [0.5, 0.75, 0.01]) {
      const z = scrollZones(zoom);
      expect(z.up).toBeCloseTo(SCROLL_UP_THRESHOLD);
      expect(z.down).toBeCloseTo(SCROLL_DOWN_THRESHOLD);
      expect(z.up).toBeLessThan(0.5);
    }
  });

  it("caps the widening so the dead zone never takes over the screen", () => {
    const huge = scrollZones(50);
    expect(huge.down - huge.up).toBeCloseTo(0.4);
  });
});
