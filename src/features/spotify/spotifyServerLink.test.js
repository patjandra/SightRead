// @vitest-environment jsdom
import { describe, it, expect, vi, afterEach } from "vitest";
import { saveLink, fetchToken, deleteLink } from "./spotifyServerLink.js";

afterEach(() => vi.unstubAllGlobals());
const stub = (res) => {
  const fn = vi.fn().mockResolvedValue(res);
  vi.stubGlobal("fetch", fn);
  return fn;
};

describe("spotifyServerLink", () => {
  it("sends the CSRF header and token body when saving", async () => {
    const fn = stub({ ok: true, status: 204 });
    await saveLink("R");
    const [url, init] = fn.mock.calls[0];
    expect(url).toBe("/api/spotify/link");
    expect(init.method).toBe("PUT");
    expect(init.headers["X-Requested-With"]).toBe("sightread");
    expect(JSON.parse(init.body)).toEqual({ refreshToken: "R" });
  });

  it("returns the minted token", async () => {
    stub({ ok: true, status: 200, json: async () => ({ accessToken: "A", expiresIn: 3600 }) });
    expect(await fetchToken()).toEqual({ accessToken: "A", expiresIn: 3600 });
  });

  it("rejects with the status when nothing is remembered", async () => {
    stub({ ok: false, status: 404 });
    await expect(fetchToken()).rejects.toMatchObject({ status: 404 });
  });

  it("deletes the link", async () => {
    const fn = stub({ ok: true, status: 204 });
    await deleteLink();
    expect(fn.mock.calls[0][1].method).toBe("DELETE");
  });
});
