import { describe, it, expect } from "vitest";
import { readFileSync } from "node:fs";

// public/sw.js is a classic script, so load it with a stub `self` and pull out
// the routing rule that decides what may ever be cached.
const source = readFileSync(new URL("../public/sw.js", import.meta.url), "utf8");
const { strategyFor } = new Function(
  "self",
  "caches",
  `${source}\nreturn { strategyFor };`
)({ addEventListener() {}, location: { origin: "https://app.test" } }, {});

const ORIGIN = "https://app.test";
const route = (path, method = "GET", mode = "no-cors", base = ORIGIN) =>
  strategyFor(base + path, method, mode, ORIGIN);

describe("service worker routing", () => {
  it("never touches the API, whatever the request", () => {
    expect(route("/api/me")).toBeNull();
    expect(route("/api/pdfs/abc/file")).toBeNull();
    expect(route("/api/pdfs", "GET", "navigate")).toBeNull();
  });

  it("never touches non-GET requests", () => {
    expect(route("/assets/index-abc.js", "POST")).toBeNull();
    expect(route("/", "PUT", "navigate")).toBeNull();
  });

  it("never touches other origins", () => {
    expect(route("/assets/x.js", "GET", "no-cors", "https://cdn.example.com")).toBeNull();
    expect(route("/", "GET", "navigate", "https://accounts.google.com")).toBeNull();
  });

  it("answers navigations from the shell", () => {
    expect(route("/", "GET", "navigate")).toBe("navigation");
    expect(route("/privacy", "GET", "navigate")).toBe("navigation");
  });

  it("caches the app's static files", () => {
    expect(route("/assets/index-abc123.js")).toBe("cache-first");
    expect(route("/mediapipe-wasm/vision_wasm_internal.wasm")).toBe("cache-first");
    expect(route("/favicon-32.png")).toBe("cache-first");
  });

  it("leaves everything else alone, including the worker script itself", () => {
    expect(route("/sw.js")).toBeNull();
    expect(route("/somewhere/else.json")).toBeNull();
  });
});
