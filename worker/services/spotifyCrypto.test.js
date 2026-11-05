import { describe, it, expect } from "vitest";
import { decryptToken, encryptToken } from "./spotifyCrypto.js";
import { SPOTIFY_TOKEN_KEY } from "../testUtils.js";

describe("spotifyCrypto", () => {
  it("round-trips a token and never stores it in plaintext", async () => {
    const enc = await encryptToken(SPOTIFY_TOKEN_KEY, "user-1", "refresh-token-abc");
    expect(enc).not.toContain("refresh-token-abc");
    expect(await decryptToken(SPOTIFY_TOKEN_KEY, "user-1", enc)).toBe("refresh-token-abc");
  });

  it("uses a fresh IV each time", async () => {
    const a = await encryptToken(SPOTIFY_TOKEN_KEY, "u", "t");
    const b = await encryptToken(SPOTIFY_TOKEN_KEY, "u", "t");
    expect(a).not.toBe(b);
  });

  it("refuses to decrypt for a different user", async () => {
    const enc = await encryptToken(SPOTIFY_TOKEN_KEY, "alice", "secret");
    expect(await decryptToken(SPOTIFY_TOKEN_KEY, "bob", enc)).toBeNull();
  });

  it("returns null for tampered or malformed ciphertext", async () => {
    const enc = await encryptToken(SPOTIFY_TOKEN_KEY, "u", "secret");
    const [iv, data] = enc.split(".");
    const flipped = `${iv}.${(data[0] === "A" ? "B" : "A") + data.slice(1)}`;
    expect(await decryptToken(SPOTIFY_TOKEN_KEY, "u", flipped)).toBeNull();
    expect(await decryptToken(SPOTIFY_TOKEN_KEY, "u", "garbage")).toBeNull();
  });

  it("fails closed when the key is missing or the wrong size", async () => {
    await expect(encryptToken(undefined, "u", "t")).rejects.toThrow(/SPOTIFY_TOKEN_KEY/);
    await expect(encryptToken("short", "u", "t")).rejects.toThrow(/SPOTIFY_TOKEN_KEY/);
  });
});
