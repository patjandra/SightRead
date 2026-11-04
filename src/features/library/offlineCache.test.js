// @vitest-environment jsdom
import { describe, it, expect, beforeEach, vi } from "vitest";
import { IDBFactory } from "fake-indexeddb";

let cache;
const blobOf = (n, fill = "x") => new Blob([fill.repeat(n)]);
const meta = (id, size = 1) => ({ id, name: `${id}.pdf`, size });

beforeEach(async () => {
  globalThis.indexedDB = new IDBFactory();
  vi.resetModules();
  cache = await import("./offlineCache.js");
});

describe("offlineCache", () => {
  it("round-trips a file and lists it without its contents", async () => {
    expect(await cache.putCached("u1", meta("a", 5), blobOf(5))).toBe(true);
    const got = await cache.getCached("u1", "a");
    expect(got.size).toBe(5);
    const list = await cache.listCached("u1");
    expect(list).toEqual([expect.objectContaining({ id: "a", name: "a.pdf", size: 5 })]);
    expect(list[0].blob).toBeUndefined();
  });

  it("misses for unknown files", async () => {
    expect(await cache.getCached("u1", "nope")).toBeNull();
  });

  it("never shows one account's files to another", async () => {
    await cache.putCached("u1", meta("a"), blobOf(1));
    expect(await cache.getCached("u2", "a")).toBeNull();
    expect(await cache.listCached("u2")).toEqual([]);
  });

  it("evicts the least recently opened files past the cap", async () => {
    const cap = 100;
    const big = 45;
    let now = 1000;
    vi.spyOn(Date, "now").mockImplementation(() => (now += 10));
    await cache.putCached("u1", meta("old", big), blobOf(big), cap);
    await cache.putCached("u1", meta("mid", big), blobOf(big), cap);
    await cache.getCached("u1", "old"); // old is now the most recently opened
    await cache.putCached("u1", meta("new", big), blobOf(big), cap);
    const ids = (await cache.listCached("u1")).map((r) => r.id).sort();
    expect(ids).toEqual(["new", "old"]);
    vi.restoreAllMocks();
  });

  it("refuses a file larger than the whole cache", async () => {
    expect(await cache.putCached("u1", meta("huge"), blobOf(101), 100)).toBe(false);
    expect(await cache.listCached("u1")).toEqual([]);
  });

  it("removeCached removes one file only", async () => {
    await cache.putCached("u1", meta("a"), blobOf(1));
    await cache.putCached("u1", meta("b"), blobOf(1));
    await cache.removeCached("u1", "a");
    expect((await cache.listCached("u1")).map((r) => r.id)).toEqual(["b"]);
  });

  it("retainOnly drops files deleted elsewhere, for that user only", async () => {
    await cache.putCached("u1", meta("a"), blobOf(1));
    await cache.putCached("u1", meta("b"), blobOf(1));
    await cache.putCached("u2", meta("a"), blobOf(1));
    await cache.retainOnly("u1", ["b"]);
    expect((await cache.listCached("u1")).map((r) => r.id)).toEqual(["b"]);
    expect(await cache.listCached("u2")).toHaveLength(1);
  });

  it("purgeOtherUsers keeps only the given account", async () => {
    await cache.putCached("u1", meta("a"), blobOf(1));
    await cache.putCached("u2", meta("b"), blobOf(1));
    await cache.purgeOtherUsers("u1");
    expect(await cache.listCached("u1")).toHaveLength(1);
    expect(await cache.listCached("u2")).toEqual([]);
  });

  it("clearCache empties everything including the remembered user", async () => {
    await cache.putCached("u1", meta("a"), blobOf(1));
    expect(await cache.getLastCachedUser()).toBe("u1");
    await cache.clearCache();
    expect(await cache.listCached("u1")).toEqual([]);
    expect(await cache.getLastCachedUser()).toBeNull();
  });
});
