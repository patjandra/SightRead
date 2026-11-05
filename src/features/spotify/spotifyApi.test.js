import { describe, it, expect, vi, afterEach } from "vitest";
import { searchTracks, playTrack } from "./spotifyApi.js";

afterEach(() => vi.unstubAllGlobals());

const stub = (res) => {
  const fn = vi.fn().mockResolvedValue(res);
  vi.stubGlobal("fetch", fn);
  return fn;
};

describe("spotifyApi", () => {
  it("maps search results", async () => {
    const fn = stub({
      ok: true,
      status: 200,
      json: async () => ({
        tracks: {
          items: [
            {
              uri: "spotify:track:1",
              name: "Clair de Lune",
              artists: [{ name: "Debussy" }, { name: "Someone" }],
              album: { images: [{ url: "big" }, { url: "small" }] },
              duration_ms: 300000,
            },
          ],
        },
      }),
    });
    const [t] = await searchTracks(" clair ", "tok");
    expect(t).toEqual({
      uri: "spotify:track:1",
      name: "Clair de Lune",
      artists: "Debussy, Someone",
      art: "small",
      durationMs: 300000,
    });
    expect(fn.mock.calls[0][0]).toContain("q=clair");
    expect(fn.mock.calls[0][1].headers.Authorization).toBe("Bearer tok");
  });

  it("skips the request for a blank query", async () => {
    const fn = stub({ ok: true });
    expect(await searchTracks("  ", "tok")).toEqual([]);
    expect(fn).not.toHaveBeenCalled();
  });

  it("reports an expired session", async () => {
    stub({ ok: false, status: 401 });
    await expect(searchTracks("x", "tok")).rejects.toMatchObject({ status: 401 });
  });

  it("plays on the given device and maps 403 to the Premium message", async () => {
    const fn = stub({ ok: true, status: 204 });
    await playTrack("dev1", "spotify:track:1", "tok");
    expect(fn.mock.calls[0][0]).toContain("device_id=dev1");
    expect(JSON.parse(fn.mock.calls[0][1].body)).toEqual({ uris: ["spotify:track:1"] });

    stub({ ok: false, status: 403 });
    await expect(playTrack("d", "u", "t")).rejects.toThrow(/Premium/);
  });
});
