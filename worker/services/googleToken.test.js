import { describe, it, expect, beforeAll } from "vitest";
import { verifyGoogleIdToken } from "./googleToken.js";
import { CLIENT_ID, makeGoogleKeys, makeIdToken } from "../testUtils.js";

let keys;
beforeAll(async () => {
  keys = await makeGoogleKeys();
});

const verify = (token, nonce = "nonce-1") =>
  verifyGoogleIdToken(token, { clientId: CLIENT_ID, nonce, keySet: keys.publicKey });

describe("verifyGoogleIdToken", () => {
  it("returns the identity for a valid token", async () => {
    const token = await makeIdToken(keys.privateKey);
    expect(await verify(token)).toEqual({
      sub: "google-sub-1",
      email: "ada@example.com",
      name: "Ada",
      picture: "https://example.com/ada.png",
    });
  });

  it("accepts the bare accounts.google.com issuer", async () => {
    const token = await makeIdToken(keys.privateKey, { iss: "accounts.google.com" });
    await expect(verify(token)).resolves.toBeTruthy();
  });

  it("rejects the wrong audience", async () => {
    const token = await makeIdToken(keys.privateKey, { aud: "someone-else" });
    await expect(verify(token)).rejects.toMatchObject({ code: "invalid_token" });
  });

  it("rejects the wrong issuer", async () => {
    const token = await makeIdToken(keys.privateKey, { iss: "https://evil.example" });
    await expect(verify(token)).rejects.toMatchObject({ code: "invalid_token" });
  });

  it("rejects an expired token", async () => {
    const token = await makeIdToken(keys.privateKey, { exp: Math.floor(Date.now() / 1000) - 60 });
    await expect(verify(token)).rejects.toMatchObject({ code: "invalid_token" });
  });

  it("rejects a token signed by a different key", async () => {
    const other = await makeGoogleKeys();
    const token = await makeIdToken(other.privateKey);
    await expect(verify(token)).rejects.toMatchObject({ code: "invalid_token" });
  });

  it("rejects a nonce mismatch or a missing nonce", async () => {
    const token = await makeIdToken(keys.privateKey);
    await expect(verify(token, "different")).rejects.toMatchObject({ code: "invalid_nonce" });
    await expect(verify(token, null)).rejects.toMatchObject({ code: "invalid_nonce" });
  });

  it("rejects an unverified email", async () => {
    const token = await makeIdToken(keys.privateKey, {}, { email_verified: false });
    await expect(verify(token)).rejects.toMatchObject({ code: "email_unverified" });
  });
});
