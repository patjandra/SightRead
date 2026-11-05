// @vitest-environment jsdom
import React from "react";
import { describe, it, expect, vi, afterEach } from "vitest";
import { render, screen, fireEvent, cleanup, act } from "@testing-library/react";
import MusicSection, { formatTime } from "./MusicSection.jsx";

const auth = { status: "signed-out", accessToken: null, error: null, login: vi.fn(), logout: vi.fn() };
const player = {
  deviceId: "dev", track: null, paused: false, positionMs: 30000, durationMs: 180000,
  error: null, premiumRequired: false, toggle: vi.fn(), seek: vi.fn(), activate: vi.fn(),
};
const api = { searchTracks: vi.fn(), playTrack: vi.fn() };

vi.mock("./useSpotifyAuth.js", () => ({ useSpotifyAuth: () => auth }));
vi.mock("./useSpotifyPlayer.js", () => ({ useSpotifyPlayer: () => player }));
vi.mock("./spotifyApi.js", () => ({
  searchTracks: (...a) => api.searchTracks(...a),
  playTrack: (...a) => api.playTrack(...a),
}));

afterEach(() => {
  cleanup();
  vi.useRealTimers();
  Object.assign(auth, { status: "signed-out", accessToken: null });
  Object.assign(player, { track: null, premiumRequired: false });
  vi.clearAllMocks();
});

describe("formatTime", () => {
  it("formats m:ss", () => {
    expect(formatTime(0)).toBe("0:00");
    expect(formatTime(65000)).toBe("1:05");
  });
});

describe("MusicSection", () => {
  it("offers to connect when signed out", () => {
    render(<MusicSection />);
    fireEvent.click(screen.getByText("Connect Spotify"));
    expect(auth.login).toHaveBeenCalled();
  });

  it("searches, plays a result, and seeks only on release", async () => {
    vi.useFakeTimers();
    Object.assign(auth, { status: "signed-in", accessToken: "tok" });
    Object.assign(player, { track: { uri: "u", name: "Now", artists: "Artist" } });
    api.searchTracks.mockResolvedValue([
      { uri: "spotify:track:1", name: "Clair de Lune", artists: "Debussy", art: null, durationMs: 1 },
    ]);
    api.playTrack.mockResolvedValue();

    render(<MusicSection />);
    fireEvent.change(screen.getByLabelText("Search Spotify"), { target: { value: "clair" } });
    await act(async () => { await vi.advanceTimersByTimeAsync(400); });
    expect(api.searchTracks).toHaveBeenCalledWith("clair", "tok");

    await act(async () => { fireEvent.click(screen.getByLabelText("Play Clair de Lune")); });
    expect(api.playTrack).toHaveBeenCalledWith("dev", "spotify:track:1", "tok");

    const slider = screen.getByLabelText("Song progress");
    fireEvent.change(slider, { target: { value: "90000" } });
    expect(player.seek).not.toHaveBeenCalled();
    expect(screen.getByText("1:30")).toBeTruthy();
    fireEvent.pointerUp(slider);
    expect(player.seek).toHaveBeenCalledWith(90000);
  });

  it("shows the Premium message", () => {
    Object.assign(auth, { status: "signed-in", accessToken: "tok" });
    player.premiumRequired = true;
    render(<MusicSection />);
    expect(screen.getByText(/Premium is required/)).toBeTruthy();
  });

  it("keeps play/pause and a mini progress bar in the header when collapsed", () => {
    localStorage.setItem("sightread-sections", JSON.stringify({ music: false }));
    Object.assign(auth, { status: "signed-in", accessToken: "tok" });
    Object.assign(player, { track: { uri: "u", name: "Now", artists: "Artist" }, paused: true });
    render(<MusicSection />);
    expect(screen.queryByLabelText("Search Spotify")).toBeNull();
    fireEvent.click(screen.getByLabelText("Play"));
    expect(player.toggle).toHaveBeenCalled();
    const mini = screen.getByLabelText("Song progress (mini)");
    fireEvent.change(mini, { target: { value: "60000" } });
    fireEvent.pointerUp(mini);
    expect(player.seek).toHaveBeenCalledWith(60000);
    localStorage.clear();
  });

  it("shows no mini controls when collapsed without a song", () => {
    localStorage.setItem("sightread-sections", JSON.stringify({ music: false }));
    Object.assign(auth, { status: "signed-in", accessToken: "tok" });
    render(<MusicSection />);
    expect(screen.queryByLabelText("Song progress (mini)")).toBeNull();
    localStorage.clear();
  });
});
