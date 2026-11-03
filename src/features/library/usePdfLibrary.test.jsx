// @vitest-environment jsdom
import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { renderHook, waitFor, act, cleanup } from "@testing-library/react";

vi.mock("./pdfApi.js", () => ({
  listPdfs: vi.fn(),
  uploadPdf: vi.fn(),
  fileSha256: vi.fn(),
  downloadPdf: vi.fn(),
  deletePdf: vi.fn(),
}));

vi.mock("./offlineCache.js", () => ({
  listCached: vi.fn(),
  getCached: vi.fn(),
  putCached: vi.fn(),
  removeCached: vi.fn(),
  retainOnly: vi.fn(),
  purgeOtherUsers: vi.fn(),
  clearCache: vi.fn(),
  getLastCachedUser: vi.fn(),
}));

import * as api from "./pdfApi.js";
import * as cache from "./offlineCache.js";
import { usePdfLibrary } from "./usePdfLibrary.js";

const USER = { id: "u1" };
const LIST = { pdfs: [{ id: "a", name: "A.pdf", size: 10 }], usedBytes: 10, limitBytes: 100 };

beforeEach(() => {
  vi.resetAllMocks();
  api.fileSha256.mockResolvedValue("hash-of-new-file");
  cache.listCached.mockResolvedValue([]);
  cache.getCached.mockResolvedValue(null);
  cache.putCached.mockResolvedValue(true);
  cache.removeCached.mockResolvedValue();
  cache.retainOnly.mockResolvedValue();
  cache.purgeOtherUsers.mockResolvedValue();
  cache.clearCache.mockResolvedValue();
  cache.getLastCachedUser.mockResolvedValue(null);
});
afterEach(cleanup);

describe("usePdfLibrary", () => {
  it("makes no requests for a guest", () => {
    const { result } = renderHook(() => usePdfLibrary({ user: null }));
    expect(result.current.pdfs).toEqual([]);
    expect(api.listPdfs).not.toHaveBeenCalled();
  });

  it("loads the list for a signed-in user and clears it on sign-out", async () => {
    api.listPdfs.mockResolvedValue(LIST);
    const { result, rerender } = renderHook(({ user }) => usePdfLibrary({ user }), {
      initialProps: { user: USER },
    });
    await waitFor(() => expect(result.current.pdfs).toHaveLength(1));
    expect(result.current).toMatchObject({ usedBytes: 10, limitBytes: 100 });

    rerender({ user: null });
    await waitFor(() => expect(result.current.pdfs).toEqual([]));
    expect(result.current.limitBytes).toBe(0);
  });

  it("save uploads under a fresh id and refreshes the list", async () => {
    api.listPdfs.mockResolvedValue({ pdfs: [], usedBytes: 0, limitBytes: 100 });
    api.uploadPdf.mockResolvedValue({ pdf: { id: "new" }, duplicate: false });
    const { result } = renderHook(() => usePdfLibrary({ user: USER }));
    await waitFor(() => expect(api.listPdfs).toHaveBeenCalledTimes(1));

    api.listPdfs.mockResolvedValue(LIST);
    const file = new File(["%PDF-"], "A.pdf");
    let saved;
    await act(async () => {
      saved = await result.current.save(file);
    });
    expect(saved).toEqual({ id: "new" });
    expect(api.uploadPdf).toHaveBeenCalledWith(expect.stringMatching(/^[0-9a-f-]{36}$/), file);
    expect(result.current.pdfs).toHaveLength(1);
    expect(result.current.busy).toBe(false);
  });

  it("reports an upload error and rejects", async () => {
    api.listPdfs.mockResolvedValue(LIST);
    api.uploadPdf.mockRejectedValue(Object.assign(new Error("Not enough storage."), { status: 413 }));
    const { result } = renderHook(() => usePdfLibrary({ user: USER }));
    await waitFor(() => expect(result.current.pdfs).toHaveLength(1));
    await act(async () => {
      await expect(result.current.save(new File(["%PDF-"], "A.pdf"))).rejects.toThrow();
    });
    expect(result.current.error).toBe("Not enough storage.");
    expect(result.current.busy).toBe(false);
  });

  it("asks the caller to re-check the session on a 401", async () => {
    api.listPdfs.mockResolvedValue(LIST);
    const onUnauthorized = vi.fn();
    api.downloadPdf.mockRejectedValue(Object.assign(new Error("Sign in required."), { status: 401 }));
    const { result } = renderHook(() => usePdfLibrary({ user: USER, onUnauthorized }));
    await waitFor(() => expect(result.current.pdfs).toHaveLength(1));
    await act(async () => {
      await expect(result.current.open("a")).rejects.toThrow();
    });
    expect(onUnauthorized).toHaveBeenCalled();
  });

  it("remove deletes and refreshes", async () => {
    api.listPdfs.mockResolvedValue(LIST);
    api.deletePdf.mockResolvedValue(undefined);
    const { result } = renderHook(() => usePdfLibrary({ user: USER }));
    await waitFor(() => expect(result.current.pdfs).toHaveLength(1));
    api.listPdfs.mockResolvedValue({ pdfs: [], usedBytes: 0, limitBytes: 100 });
    await act(async () => {
      await result.current.remove("a");
    });
    expect(api.deletePdf).toHaveBeenCalledWith("a");
    expect(result.current.pdfs).toEqual([]);
  });

  describe("picking up changes from other devices", () => {
    beforeEach(() => vi.useFakeTimers());
    afterEach(() => vi.useRealTimers());

    it("re-fetches on the poll interval and when the window regains focus", async () => {
      api.listPdfs.mockResolvedValue(LIST);
      const { result } = renderHook(() => usePdfLibrary({ user: USER }));
      await act(async () => {});
      expect(result.current.pdfs).toHaveLength(1);
      expect(api.listPdfs).toHaveBeenCalledTimes(1);

      api.listPdfs.mockResolvedValue({ pdfs: [], usedBytes: 0, limitBytes: 100 });
      await act(async () => {
        vi.advanceTimersByTime(15_000);
      });
      expect(result.current.pdfs).toEqual([]);

      api.listPdfs.mockResolvedValue(LIST);
      await act(async () => {
        vi.advanceTimersByTime(3_000);
        window.dispatchEvent(new Event("focus"));
      });
      expect(result.current.pdfs).toHaveLength(1);
    });

    it("does not poll for a guest", async () => {
      renderHook(() => usePdfLibrary({ user: null }));
      await act(async () => {
        vi.advanceTimersByTime(60_000);
      });
      expect(api.listPdfs).not.toHaveBeenCalled();
    });
  });

  it("refreshes when the network returns and stops polling while offline", async () => {
    api.listPdfs.mockResolvedValue(LIST);
    renderHook(() => usePdfLibrary({ user: USER }));
    await waitFor(() => expect(api.listPdfs).toHaveBeenCalledTimes(1));

    act(() => void window.dispatchEvent(new Event("offline")));
    act(() => void window.dispatchEvent(new Event("focus")));
    expect(api.listPdfs).toHaveBeenCalledTimes(1); // no polling while offline

    act(() => void window.dispatchEvent(new Event("online")));
    await waitFor(() => expect(api.listPdfs).toHaveBeenCalledTimes(2));
  });

  describe("offline copies", () => {
    const BLOB = new Blob(["%PDF-"]);

    it("opens the copy on this device without downloading", async () => {
      api.listPdfs.mockResolvedValue(LIST);
      cache.getCached.mockResolvedValue(BLOB);
      const { result } = renderHook(() => usePdfLibrary({ user: USER }));
      await waitFor(() => expect(result.current.pdfs).toHaveLength(1));
      let got;
      await act(async () => {
        got = await result.current.open("a");
      });
      expect(got).toBe(BLOB);
      expect(cache.getCached).toHaveBeenCalledWith("u1", "a");
      expect(api.downloadPdf).not.toHaveBeenCalled();
    });

    it("keeps a copy of a file as soon as it is saved, no second click needed", async () => {
      api.listPdfs.mockResolvedValue({ pdfs: [], usedBytes: 0, limitBytes: 100 });
      api.uploadPdf.mockResolvedValue({ pdf: { id: "new", name: "A.pdf", size: 5 }, duplicate: false });
      const { result } = renderHook(() => usePdfLibrary({ user: USER }));
      await waitFor(() => expect(api.listPdfs).toHaveBeenCalledTimes(1));
      const file = new File(["%PDF-"], "A.pdf");
      await act(async () => {
        await result.current.save(file);
      });
      expect(cache.putCached).toHaveBeenCalledWith("u1", { id: "new", name: "A.pdf", size: 5 }, file);
      expect(api.downloadPdf).not.toHaveBeenCalled();
    });

    it("caches under the user passed in when saving right after sign-in", async () => {
      api.uploadPdf.mockResolvedValue({ pdf: { id: "new", name: "A.pdf", size: 5 }, duplicate: false });
      api.listPdfs.mockResolvedValue(LIST);
      const { result } = renderHook(() => usePdfLibrary({ user: null, authStatus: "guest" }));
      const file = new File(["%PDF-"], "A.pdf");
      await act(async () => {
        await result.current.save(file, USER).catch(() => {});
      });
      expect(cache.putCached).toHaveBeenCalledWith("u1", expect.objectContaining({ id: "new" }), file);
    });

    it("a failed copy never fails the save", async () => {
      api.listPdfs.mockResolvedValue(LIST);
      api.uploadPdf.mockResolvedValue({ pdf: { id: "new", name: "A.pdf", size: 5 }, duplicate: false });
      cache.putCached.mockRejectedValue(new Error("quota"));
      vi.spyOn(console, "error").mockImplementation(() => {});
      const { result } = renderHook(() => usePdfLibrary({ user: USER }));
      await waitFor(() => expect(result.current.pdfs).toHaveLength(1));
      let saved;
      await act(async () => {
        saved = await result.current.save(new File(["%PDF-"], "A.pdf"));
      });
      expect(saved.id).toBe("new");
    });

    it("downloads on a miss and keeps a copy for next time", async () => {
      api.listPdfs.mockResolvedValue(LIST);
      api.downloadPdf.mockResolvedValue(BLOB);
      const { result } = renderHook(() => usePdfLibrary({ user: USER }));
      await waitFor(() => expect(result.current.pdfs).toHaveLength(1));
      await act(async () => {
        await result.current.open("a");
      });
      expect(cache.putCached).toHaveBeenCalledWith("u1", LIST.pdfs[0], BLOB);
    });

    it("still opens the PDF if keeping a copy fails", async () => {
      api.listPdfs.mockResolvedValue(LIST);
      api.downloadPdf.mockResolvedValue(BLOB);
      cache.putCached.mockRejectedValue(new Error("quota"));
      vi.spyOn(console, "error").mockImplementation(() => {});
      const { result } = renderHook(() => usePdfLibrary({ user: USER }));
      await waitFor(() => expect(result.current.pdfs).toHaveLength(1));
      let got;
      await act(async () => {
        got = await result.current.open("a");
      });
      expect(got).toBe(BLOB);
    });

    it("says so when an uncached PDF is opened offline", async () => {
      api.listPdfs.mockResolvedValue(LIST);
      api.downloadPdf.mockRejectedValue(new TypeError("Failed to fetch"));
      const { result } = renderHook(() => usePdfLibrary({ user: USER }));
      await waitFor(() => expect(result.current.pdfs).toHaveLength(1));
      await act(async () => {
        await result.current.open("a").catch(() => {});
      });
      expect(result.current.error).toBe("This PDF isn't available offline.");
    });

    it("marks cached files and drops copies of files deleted elsewhere", async () => {
      api.listPdfs.mockResolvedValue(LIST);
      cache.listCached.mockResolvedValue([{ id: "a", name: "A.pdf", size: 10, lastOpenedAt: 1 }]);
      const { result } = renderHook(() => usePdfLibrary({ user: USER }));
      await waitFor(() => expect(result.current.pdfs[0]?.offline).toBe(true));
      expect(cache.purgeOtherUsers).toHaveBeenCalledWith("u1");
      expect(cache.retainOnly).toHaveBeenCalledWith("u1", ["a"]);
      expect(result.current).toMatchObject({ offlineCount: 1, offlineBytes: 10 });
    });

    it("deleting a PDF removes its copy", async () => {
      api.listPdfs.mockResolvedValue(LIST);
      api.deletePdf.mockResolvedValue();
      const { result } = renderHook(() => usePdfLibrary({ user: USER }));
      await waitFor(() => expect(result.current.pdfs).toHaveLength(1));
      await act(async () => {
        await result.current.remove("a");
      });
      expect(cache.removeCached).toHaveBeenCalledWith("u1", "a");
    });

    it("falls back to the cached list when the server can't be reached", async () => {
      api.listPdfs.mockRejectedValue(new TypeError("Failed to fetch"));
      cache.listCached.mockResolvedValue([{ id: "a", name: "A.pdf", size: 10, lastOpenedAt: 1 }]);
      const { result } = renderHook(() => usePdfLibrary({ user: USER }));
      await waitFor(() => expect(result.current.pdfs).toHaveLength(1));
      expect(result.current.fromCache).toBe(true);
      expect(result.current.error).toMatch(/Offline/);
    });

    it("shows the last account's files when the session can't be checked", async () => {
      cache.getLastCachedUser.mockResolvedValue("u1");
      cache.listCached.mockResolvedValue([{ id: "a", name: "A.pdf", size: 10, lastOpenedAt: 1 }]);
      const { result } = renderHook(() =>
        usePdfLibrary({ user: null, authStatus: "guest", sessionUnknown: true })
      );
      await waitFor(() => expect(result.current.pdfs).toHaveLength(1));
      expect(result.current.showList).toBe(true);
      expect(cache.clearCache).not.toHaveBeenCalled();
      expect(api.listPdfs).not.toHaveBeenCalled();
    });

    it("clears everything once signed out is confirmed, but not when the check just failed", async () => {
      renderHook(() => usePdfLibrary({ user: null, authStatus: "guest", sessionUnknown: true }));
      await Promise.resolve();
      expect(cache.clearCache).not.toHaveBeenCalled();

      renderHook(() => usePdfLibrary({ user: null, authStatus: "guest", sessionUnknown: false }));
      await waitFor(() => expect(cache.clearCache).toHaveBeenCalledTimes(1));
    });

    it("does not clear while the session is still loading", async () => {
      renderHook(() => usePdfLibrary({ user: null, authStatus: "loading" }));
      await Promise.resolve();
      expect(cache.clearCache).not.toHaveBeenCalled();
    });

  });

  describe("duplicate files", () => {
    const EXISTING = { id: "a", name: "A.pdf", size: 10, sha256: "hash-of-a" };
    const withExisting = { pdfs: [EXISTING], usedBytes: 10, limitBytes: 100 };

    it("skips the upload when the library already holds the same contents", async () => {
      api.listPdfs.mockResolvedValue(withExisting);
      api.fileSha256.mockResolvedValue("hash-of-a");
      const { result } = renderHook(() => usePdfLibrary({ user: USER }));
      await waitFor(() => expect(result.current.pdfs).toHaveLength(1));
      let saved;
      await act(async () => {
        saved = await result.current.save(new File(["%PDF-"], "Renamed.pdf"));
      });
      expect(api.uploadPdf).not.toHaveBeenCalled();
      expect(saved).toBe(EXISTING);
      expect(result.current.notice).toBe('Already in your library as "A.pdf".');
      expect(result.current.error).toBeNull();
    });

    it("reports a duplicate the server found that the local list missed", async () => {
      api.listPdfs.mockResolvedValue({ pdfs: [], usedBytes: 0, limitBytes: 100 });
      api.uploadPdf.mockResolvedValue({ pdf: EXISTING, duplicate: true });
      const { result } = renderHook(() => usePdfLibrary({ user: USER }));
      await waitFor(() => expect(api.listPdfs).toHaveBeenCalledTimes(1));
      await act(async () => {
        await result.current.save(new File(["%PDF-"], "A.pdf"));
      });
      expect(result.current.notice).toBe('Already in your library as "A.pdf".');
    });

    it("still uploads if the fingerprint can't be computed", async () => {
      api.listPdfs.mockResolvedValue(withExisting);
      api.fileSha256.mockRejectedValue(new Error("no crypto"));
      api.uploadPdf.mockResolvedValue({ pdf: { id: "new", name: "B.pdf", size: 1 }, duplicate: false });
      const { result } = renderHook(() => usePdfLibrary({ user: USER }));
      await waitFor(() => expect(result.current.pdfs).toHaveLength(1));
      await act(async () => {
        await result.current.save(new File(["%PDF-"], "B.pdf"));
      });
      expect(api.uploadPdf).toHaveBeenCalled();
      expect(result.current.notice).toBeNull();
    });

    it("clears the notice on the next save", async () => {
      api.listPdfs.mockResolvedValue(withExisting);
      api.fileSha256.mockResolvedValueOnce("hash-of-a").mockResolvedValue("other");
      api.uploadPdf.mockResolvedValue({ pdf: { id: "new", name: "B.pdf", size: 1 }, duplicate: false });
      const { result } = renderHook(() => usePdfLibrary({ user: USER }));
      await waitFor(() => expect(result.current.pdfs).toHaveLength(1));
      await act(async () => {
        await result.current.save(new File(["%PDF-"], "A.pdf"));
      });
      expect(result.current.notice).not.toBeNull();
      await act(async () => {
        await result.current.save(new File(["%PDF-"], "B.pdf"));
      });
      expect(result.current.notice).toBeNull();
    });
  });
});
