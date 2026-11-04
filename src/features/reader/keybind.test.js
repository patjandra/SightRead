// @vitest-environment jsdom
import { describe, it, expect, beforeEach } from "vitest";
import {
  eventToBinding, matchesBinding, formatBinding, isScrollKey, isScrollKeyEvent,
  isTypingTarget, loadBinding, saveBinding,
} from "./keybind.js";

const ev = (code, mods = {}) => ({ code, ctrlKey: false, altKey: false, shiftKey: false, metaKey: false, ...mods });

describe("keybind", () => {
  beforeEach(() => localStorage.clear());

  it("ignores a bare modifier press", () => {
    expect(eventToBinding(ev("ShiftLeft", { shiftKey: true }))).toBeNull();
  });

  it("matches the same key with the same modifiers only", () => {
    const b = eventToBinding(ev("KeyT", { shiftKey: true }));
    expect(matchesBinding(b, ev("KeyT", { shiftKey: true }))).toBe(true);
    expect(matchesBinding(b, ev("KeyT"))).toBe(false);
    expect(matchesBinding(b, ev("KeyY", { shiftKey: true }))).toBe(false);
    expect(matchesBinding(null, ev("KeyT"))).toBe(false);
  });

  it("formats a readable label", () => {
    expect(formatBinding(eventToBinding(ev("KeyT", { shiftKey: true })))).toBe("Shift+T");
    expect(formatBinding(eventToBinding(ev("Digit5")))).toBe("5");
  });

  it("flags keys that scroll the page", () => {
    expect(isScrollKey("Space")).toBe(true);
    expect(isScrollKey("KeyT")).toBe(false);
    expect(isScrollKeyEvent(ev("ArrowDown"))).toBe(true);
    expect(isScrollKeyEvent(ev("ArrowDown", { metaKey: true }))).toBe(false);
  });

  it("treats form fields as typing targets", () => {
    expect(isTypingTarget(document.createElement("input"))).toBe(true);
    expect(isTypingTarget(document.createElement("div"))).toBe(false);
  });

  it("round-trips through storage and clears", () => {
    const b = eventToBinding(ev("KeyT"));
    saveBinding(b);
    expect(loadBinding()).toEqual(b);
    saveBinding(null);
    expect(loadBinding()).toBeNull();
  });

  it("ignores corrupt stored data", () => {
    localStorage.setItem("sightread-tracking-key", "{nope");
    expect(loadBinding()).toBeNull();
  });
});
