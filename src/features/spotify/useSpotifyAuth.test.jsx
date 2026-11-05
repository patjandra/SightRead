// @vitest-environment jsdom
import React from "react";
import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { renderHook, act, cleanup } from "@testing-library/react";

const app = { status: "guest" };
vi.mock("../auth/useAuth.js", () => ({ useAuth: () => app }));
const link = { saveLink: vi.fn(), fetchToken: vi.fn(), deleteLink: vi.fn() };
vi.mock("./spotifyServerLink.js", () => ({
  saveLink: (...a) => link.saveLink(...a),
  fetchToken: (...a) => link.fetchToken(...a),
  deleteLink: (...a) => link.deleteLink(...a),
}));
const auth = { exchangeCode: vi.fn(), startLogin: vi.fn() };
vi.mock("./spotifyAuth.js", async (orig) => ({
  ...(await orig()),
  exchangeCode: (...a) => auth.exchangeCode(...a),
  startLogin: (...a) => auth.startLogin(...a),
}));

import { useSpotifyAuth } from "./useSpotifyAuth.js";
import { MESSAGE_TYPE, TOKENS_KEY } from "./spotifyAuth.js";

beforeEach(() => {
  sessionStorage.clear();
  app.status = "guest";
  link.fetchToken.mockRejectedValue({ status: 404 });
  link.saveLink.mockResolvedValue(null);
  link.deleteLink.mockResolvedValue(null);
});
afterEach(() => {
  cleanup();
  vi.clearAllMocks();
});

const flush = () => act(async () => { await Promise.resolve(); await Promise.resolve(); });
const popupMessage = (data) =>
  act(async () => {
    window.dispatchEvent(new MessageEvent("message", { origin: window.location.origin, data: { type: MESSAGE_TYPE, ...data } }));
    await Promise.resolve();
    await Promise.resolve();
  });
const fresh = { access: "A", refresh: "R", expiresAt: Date.now() + 3600_000 };

describe("useSpotifyAuth: remember me", () => {
  it("offers Remember me only to signed-in SightRead users", () => {
    const guest = renderHook(() => useSpotifyAuth());
    expect(guest.result.current.canRemember).toBe(false);
    app.status = "signed-in";
    const user = renderHook(() => useSpotifyAuth());
    expect(user.result.current.canRemember).toBe(true);
  });

  it("restores a remembered login on load without a click", async () => {
    app.status = "signed-in";
    link.fetchToken.mockResolvedValue({ accessToken: "SERVER", expiresIn: 3600 });
    const { result } = renderHook(() => useSpotifyAuth());
    await flush();
    expect(result.current.status).toBe("signed-in");
    expect(result.current.accessToken).toBe("SERVER");
    expect(result.current.remembered).toBe(true);
    // The browser never holds a refresh token for a remembered login.
    expect(JSON.parse(sessionStorage.getItem(TOKENS_KEY)).refresh).toBeUndefined();
  });

  it("stays signed out when nothing is remembered", async () => {
    app.status = "signed-in";
    const { result } = renderHook(() => useSpotifyAuth());
    await flush();
    expect(result.current.status).toBe("signed-out");
  });

  it("does not ask the server for guests", async () => {
    renderHook(() => useSpotifyAuth());
    await flush();
    expect(link.fetchToken).not.toHaveBeenCalled();
  });

  it("saves the refresh token to the account when Remember me is ticked", async () => {
    app.status = "signed-in";
    auth.exchangeCode.mockResolvedValue(fresh);
    const { result } = renderHook(() => useSpotifyAuth());
    await flush();
    act(() => result.current.setRemember(true));
    await popupMessage({ code: "c", state: "s" });
    expect(link.saveLink).toHaveBeenCalledWith("R");
    expect(result.current.remembered).toBe(true);
    expect(JSON.parse(sessionStorage.getItem(TOKENS_KEY)).refresh).toBeUndefined();
  });

  it("does not save anything when Remember me is unticked", async () => {
    app.status = "signed-in";
    auth.exchangeCode.mockResolvedValue(fresh);
    const { result } = renderHook(() => useSpotifyAuth());
    await flush();
    await popupMessage({ code: "c", state: "s" });
    expect(link.saveLink).not.toHaveBeenCalled();
    expect(result.current.remembered).toBe(false);
    expect(result.current.status).toBe("signed-in");
  });

  it("falls back to a tab-only login if remembering fails", async () => {
    app.status = "signed-in";
    auth.exchangeCode.mockResolvedValue(fresh);
    link.saveLink.mockRejectedValue(new Error("x"));
    const { result } = renderHook(() => useSpotifyAuth());
    await flush();
    act(() => result.current.setRemember(true));
    await popupMessage({ code: "c", state: "s" });
    expect(result.current.status).toBe("signed-in");
    expect(result.current.remembered).toBe(false);
    expect(result.current.error).toMatch(/remember/i);
  });

  it("Disconnect clears the tab and deletes the remembered login", async () => {
    app.status = "signed-in";
    link.fetchToken.mockResolvedValue({ accessToken: "S", expiresIn: 3600 });
    const { result } = renderHook(() => useSpotifyAuth());
    await flush();
    act(() => result.current.logout());
    expect(link.deleteLink).toHaveBeenCalled();
    expect(result.current.status).toBe("signed-out");
    expect(sessionStorage.getItem(TOKENS_KEY)).toBeNull();
  });

  it("signing out of SightRead clears the tab but keeps the remembered login", async () => {
    app.status = "signed-in";
    link.fetchToken.mockResolvedValue({ accessToken: "S", expiresIn: 3600 });
    const { result, rerender } = renderHook(() => useSpotifyAuth());
    await flush();
    expect(result.current.status).toBe("signed-in");
    app.status = "guest";
    rerender();
    await flush();
    expect(result.current.status).toBe("signed-out");
    expect(link.deleteLink).not.toHaveBeenCalled();
  });

  it("unticking Remember me forgets the login on the account but keeps this tab connected", async () => {
    app.status = "signed-in";
    link.fetchToken.mockResolvedValue({ accessToken: "S", expiresIn: 3600 });
    const { result } = renderHook(() => useSpotifyAuth());
    await flush();
    await act(async () => { await result.current.setRemembered(false); });
    expect(link.deleteLink).toHaveBeenCalled();
    expect(result.current.remembered).toBe(false);
    expect(result.current.status).toBe("signed-in");
  });

  it("ticking Remember me while connected saves the refresh token", async () => {
    app.status = "signed-in";
    auth.exchangeCode.mockResolvedValue(fresh);
    const { result } = renderHook(() => useSpotifyAuth());
    await flush();
    await popupMessage({ code: "c", state: "s" });
    expect(result.current.remembered).toBe(false);
    await act(async () => { await result.current.setRemembered(true); });
    expect(link.saveLink).toHaveBeenCalledWith("R");
    expect(result.current.remembered).toBe(true);
    expect(JSON.parse(sessionStorage.getItem(TOKENS_KEY)).refresh).toBeUndefined();
  });

  it("can't re-remember a login that no longer has a refresh token", async () => {
    app.status = "signed-in";
    link.fetchToken.mockResolvedValue({ accessToken: "S", expiresIn: 3600 });
    const { result } = renderHook(() => useSpotifyAuth());
    await flush();
    await act(async () => { await result.current.setRemembered(false); });
    await act(async () => { await result.current.setRemembered(true); });
    expect(link.saveLink).not.toHaveBeenCalled();
    expect(result.current.error).toMatch(/again/i);
  });
});
