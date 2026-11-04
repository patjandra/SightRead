// @vitest-environment jsdom
import { describe, it, expect, beforeEach } from "vitest";
import { renderHook, act } from "@testing-library/react";
import { useSectionOpen } from "./useSectionOpen.js";

beforeEach(() => localStorage.clear());

describe("useSectionOpen", () => {
  it("starts open", () => {
    expect(renderHook(() => useSectionOpen("face")).result.current[0]).toBe(true);
  });

  it("remembers a collapsed section after a remount, per section", () => {
    const first = renderHook(() => useSectionOpen("face"));
    act(() => first.result.current[1]());
    expect(first.result.current[0]).toBe(false);
    first.unmount();

    expect(renderHook(() => useSectionOpen("face")).result.current[0]).toBe(false);
    expect(renderHook(() => useSectionOpen("gaze")).result.current[0]).toBe(true);
  });

  it("re-opens and remembers that too", () => {
    const first = renderHook(() => useSectionOpen("gaze"));
    act(() => first.result.current[1]());
    act(() => first.result.current[1]());
    first.unmount();
    expect(renderHook(() => useSectionOpen("gaze")).result.current[0]).toBe(true);
  });

  it("ignores corrupt stored data", () => {
    localStorage.setItem("sightread-sections", "{not json");
    expect(renderHook(() => useSectionOpen("face")).result.current[0]).toBe(true);
  });
});
