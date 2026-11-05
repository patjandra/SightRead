import { describe, it, expect } from "vitest";
import { generateVerifier, challengeFor, randomString } from "./pkce.js";

describe("pkce", () => {
  it("makes a URL-safe verifier of the required length", () => {
    const v = generateVerifier();
    expect(v).toMatch(/^[A-Za-z0-9_-]{43}$/);
    expect(generateVerifier()).not.toBe(v);
  });

  it("matches the RFC 7636 example challenge", async () => {
    const verifier = "dBjftJeZ4CVP-mB92K27uhbUJU1p1r_wW1gFWFOEjXk";
    expect(await challengeFor(verifier)).toBe("E9Melhoa2OwvFrEMTJguCHaoeK1t8URWbuGJSstw-cM");
  });

  it("randomString is URL-safe", () => {
    expect(randomString(16)).toMatch(/^[A-Za-z0-9_-]+$/);
  });
});
