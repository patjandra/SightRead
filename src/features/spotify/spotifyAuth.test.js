// @vitest-environment jsdom
import { describe, it, expect, beforeEach, vi, afterEach } from "vitest";
import { exchangeCode, refreshTokens, loadTokens, saveTokens, clearTokens, startLogin } from "./spotifyAuth.js";

const tokenResponse = { access_token: "A", refresh_token: "R", expires_in: 3600 };

beforeEach(() => sessionStorage.clear());
afterEach(() => vi.restoreAllMocks());

function mockFetch(json = tokenResponse, ok = true) {
  const fn = vi.fn().mockResolvedValue({ ok, json: async () => json });
  vi.stubGlobal("fetch", fn);
  return fn;
}

describe("spotifyAuth", () => {
  it("startLogin stores verifier/state and opens the authorize URL with PKCE", async () => {
    const open = vi.spyOn(window, "open").mockReturnValue({});
    await startLogin();
    const url = new URL(open.mock.calls[0][0]);
    expect(url.origin + url.pathname).toBe("https://accounts.spotify.com/authorize");
    expect(url.searchParams.get("code_challenge_method")).toBe("S256");
    expect(url.searchParams.get("redirect_uri")).toMatch(/\/spotify\/callback$/);
    const pending = JSON.parse(sessionStorage.getItem("sightread-spotify-pending"));
    expect(url.searchParams.get("state")).toBe(pending.state);
  });

  it("exchanges a code when state matches, sending the verifier and no secret", async () => {
    sessionStorage.setItem("sightread-spotify-pending", JSON.stringify({ verifier: "V", state: "S" }));
    const fetchMock = mockFetch();
    const tokens = await exchangeCode("CODE", "S");
    expect(tokens.access).toBe("A");
    expect(tokens.refresh).toBe("R");
    const body = fetchMock.mock.calls[0][1].body.toString();
    expect(body).toContain("code_verifier=V");
    expect(body).not.toContain("client_secret");
    expect(sessionStorage.getItem("sightread-spotify-pending")).toBeNull();
  });

  it("rejects a mismatched state without calling Spotify", async () => {
    sessionStorage.setItem("sightread-spotify-pending", JSON.stringify({ verifier: "V", state: "S" }));
    const fetchMock = mockFetch();
    await expect(exchangeCode("CODE", "OTHER")).rejects.toThrow();
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it("keeps the old refresh token when refresh returns none", async () => {
    mockFetch({ access_token: "B", expires_in: 3600 });
    expect((await refreshTokens("OLD")).refresh).toBe("OLD");
  });

  it("saves, loads and clears tokens in sessionStorage only", () => {
    saveTokens({ access: "a", refresh: "r", expiresAt: 1 });
    expect(loadTokens().access).toBe("a");
    expect(localStorage.length).toBe(0);
    clearTokens();
    expect(loadTokens()).toBeNull();
  });
});
