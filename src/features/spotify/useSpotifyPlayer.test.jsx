// @vitest-environment jsdom
import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { renderHook, act } from "@testing-library/react";
import { useSpotifyPlayer } from "./useSpotifyPlayer.js";

let listeners;
let player;

beforeEach(() => {
  vi.useFakeTimers({ toFake: ["setTimeout", "clearTimeout", "setInterval", "clearInterval", "performance"] });
  listeners = {};
  player = {
    addListener: (name, fn) => (listeners[name] = fn),
    connect: vi.fn(),
    disconnect: vi.fn(),
    togglePlay: vi.fn(),
    seek: vi.fn(),
  };
  window.Spotify = { Player: vi.fn(() => player) };
});
afterEach(() => {
  vi.useRealTimers();
  delete window.Spotify;
});

const flush = () => act(async () => { await Promise.resolve(); });
const state = (over = {}) => ({
  paused: false,
  position: 1000,
  duration: 200000,
  track_window: { current_track: { uri: "u", name: "Song", artists: [{ name: "A" }] } },
  ...over,
});

describe("useSpotifyPlayer", () => {
  it("does nothing until enabled", async () => {
    renderHook(() => useSpotifyPlayer({ accessToken: "t", enabled: false }));
    await flush();
    expect(window.Spotify.Player).not.toHaveBeenCalled();
  });

  it("reports the device id and track from SDK events", async () => {
    const { result } = renderHook(() => useSpotifyPlayer({ accessToken: "t", enabled: true }));
    await flush();
    act(() => listeners.ready({ device_id: "dev1" }));
    act(() => listeners.player_state_changed(state()));
    expect(result.current.deviceId).toBe("dev1");
    expect(result.current.track).toMatchObject({ name: "Song", artists: "A" });
    expect(result.current.durationMs).toBe(200000);
  });

  it("advances the position while playing and stops when paused", async () => {
    const { result } = renderHook(() => useSpotifyPlayer({ accessToken: "t", enabled: true }));
    await flush();
    act(() => listeners.player_state_changed(state()));
    act(() => vi.advanceTimersByTime(1000));
    expect(result.current.positionMs).toBeGreaterThan(1500);
    act(() => listeners.player_state_changed(state({ paused: true, position: 5000 })));
    act(() => vi.advanceTimersByTime(2000));
    expect(result.current.positionMs).toBe(5000);
  });

  it("seek updates the position immediately and tells the SDK", async () => {
    const { result } = renderHook(() => useSpotifyPlayer({ accessToken: "t", enabled: true }));
    await flush();
    act(() => result.current.seek(42000));
    expect(result.current.positionMs).toBe(42000);
    expect(player.seek).toHaveBeenCalledWith(42000);
  });

  it("flags accounts without Premium and disconnects on unmount", async () => {
    const { result, unmount } = renderHook(() => useSpotifyPlayer({ accessToken: "t", enabled: true }));
    await flush();
    act(() => listeners.account_error());
    expect(result.current.premiumRequired).toBe(true);
    unmount();
    expect(player.disconnect).toHaveBeenCalled();
  });
});
