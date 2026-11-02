import { describe, it, expect } from "vitest";
import { SignJWT } from "jose";
import { signSession, verifySession, SESSION_TTL_SEC } from "./session.js";

const SECRET = "a-test-secret-a-test-secret-a-test";
const DAY_MS = 24 * 60 * 60 * 1000;

describe("session tokens", () => {
  it("round-trips the user id", async () => {
    const token = await signSession(SECRET, "user-1");
    expect(await verifySession(SECRET, token)).toEqual({ userId: "user-1", needsRefresh: false });
  });

  it("rejects a missing, tampered, or wrong-secret token", async () => {
    const token = await signSession(SECRET, "user-1");
    expect(await verifySession(SECRET, undefined)).toBeNull();
    expect(await verifySession(SECRET, token.slice(0, -2) + "xx")).toBeNull();
    expect(await verifySession("another-secret-another-secret-12", token)).toBeNull();
  });

  it("rejects an expired token", async () => {
    const now = Date.now();
    const token = await signSession(SECRET, "user-1", now);
    expect(await verifySession(SECRET, token, now + SESSION_TTL_SEC * 1000 + 1000)).toBeNull();
  });

  it("asks for a refresh once the token is over a day old", async () => {
    const now = Date.now();
    const token = await signSession(SECRET, "user-1", now);
    expect((await verifySession(SECRET, token, now + 2 * DAY_MS)).needsRefresh).toBe(true);
  });

  it("rejects an unsigned (alg none) token", async () => {
    const forged = `${btoa(JSON.stringify({ alg: "none" }))}.${btoa(JSON.stringify({ sub: "user-1" }))}.`;
    expect(await verifySession(SECRET, forged)).toBeNull();
  });

  it("rejects tokens signed with a different algorithm", async () => {
    const token = await new SignJWT({}).setProtectedHeader({ alg: "HS512" }).setSubject("u").setExpirationTime("1h")
      .sign(new TextEncoder().encode(SECRET));
    expect(await verifySession(SECRET, token)).toBeNull();
  });
});
