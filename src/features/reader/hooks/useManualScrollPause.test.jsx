// @vitest-environment jsdom
import { describe, it, expect, vi, afterEach } from "vitest";
import { renderHook, cleanup } from "@testing-library/react";
import { fireEvent } from "@testing-library/react";
import { useManualScrollPause } from "./useManualScrollPause.js";

afterEach(cleanup);

function setup() {
  const container = document.createElement("div");
  document.body.appendChild(container);
  const onManualScroll = vi.fn();
  renderHook(() => useManualScrollPause({ active: true, containerRef: { current: container }, onManualScroll }));
  return onManualScroll;
}

describe("useManualScrollPause", () => {
  it("fires on a scroll key from the page", () => {
    const fn = setup();
    fireEvent.keyDown(document.body, { code: "ArrowDown", key: "ArrowDown" });
    expect(fn).toHaveBeenCalledTimes(1);
  });

  it("ignores scroll keys inside a data-no-scroll-pause region", () => {
    const fn = setup();
    const region = document.createElement("section");
    region.setAttribute("data-no-scroll-pause", "");
    const slider = document.createElement("input");
    region.appendChild(slider);
    document.body.appendChild(region);
    fireEvent.keyDown(slider, { code: "ArrowRight", key: "ArrowRight" });
    expect(fn).not.toHaveBeenCalled();
  });
});
